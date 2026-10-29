"""Render-only refinement and focus closures matching the browser helpers.
Source meshes/UVs remain available for placement and fit; this runs last.
"""
import bpy
import numpy as np
from mathutils import Vector
from mathutils.geometry import tessellate_polygon


def refine_arrays(vertices, normals, weights):
    """Same .7 tangent-plane interpolation as closeupGeometry.ts."""
    p = np.einsum('wc,fcd->fwd', weights, vertices)
    n = normals / np.maximum(np.linalg.norm(normals, axis=2, keepdims=True), 1e-20)
    distance = np.einsum('fwcd,fcd->fwc', p[:, :, None, :] - vertices[:, None, :, :], n)
    return p - .7 * np.einsum('fwc,wc,fcd->fwd', distance, weights, n)


def refine_body(body, segments=3):
    mesh = body.data
    mesh.calc_loop_triangles()
    triangles = np.array([t.vertices[:] for t in mesh.loop_triangles])
    loops = np.array([t.loops[:] for t in mesh.loop_triangles])
    points = np.array([v.co[:] for v in mesh.vertices])
    normals = np.array([v.normal[:] for v in mesh.vertices])
    weights = []
    def w(i, j): return [1 - (i + j) / segments, i / segments, j / segments]
    for i in range(segments):
        for j in range(segments - i):
            weights.extend((w(i, j), w(i+1, j), w(i, j+1)))
            if i+j < segments-1: weights.extend((w(i+1, j), w(i+1, j+1), w(i, j+1)))
    weights = np.array(weights)
    refined = refine_arrays(points[triangles], normals[triangles], weights).reshape(-1, 3)
    result = bpy.data.meshes.new(mesh.name + ' shared closeup')
    result.from_pydata(refined.tolist(), [], np.arange(len(refined)).reshape(-1, 3).tolist())
    for mat in mesh.materials: result.materials.append(mat)
    for layer in mesh.uv_layers:
        uv = np.array([v.uv[:] for v in layer.data])
        out = result.uv_layers.new(name=layer.name)
        out.data.foreach_set('uv', np.einsum('wc,fcd->fwd', weights, uv[loops]).reshape(-1))
    for attr in mesh.attributes:
        if attr.name.startswith('.') or attr.name in ('position', 'normal') or attr.domain != 'POINT': continue
        if attr.data_type not in ('FLOAT', 'FLOAT_VECTOR'): continue
        key = 'value' if attr.data_type == 'FLOAT' else 'vector'
        data = np.array([getattr(x, key) for x in attr.data])
        out = result.attributes.new(attr.name, attr.data_type, 'POINT')
        values = np.einsum('wc,fc->fw', weights, data[triangles]) if key == 'value' else np.einsum('wc,fcd->fwd', weights, data[triangles])
        out.data.foreach_set(key, values.reshape(-1))
    interpolated = np.einsum('wc,fcd->fwd', weights, normals[triangles]).reshape(-1, 3)
    interpolated /= np.maximum(np.linalg.norm(interpolated, axis=1, keepdims=True), 1e-20)
    for p in result.polygons: p.use_smooth = True
    result.normals_split_custom_set_from_vertices(interpolated.tolist())
    body['smartink_source_mesh'] = mesh.name
    mesh.use_fake_user = True
    body.data = result
    # Browser uses the source cage plus this shell, not native multires modifiers.
    for modifier in list(body.modifiers): body.modifiers.remove(modifier)
    body['smartink_closeup_segments'] = segments
    result.update()


def add_focus_caps(body, values, colour):
    """Close the same signed-field contour, with a subtly recessed centre."""
    mesh = body.data; mesh.calc_loop_triangles()
    vertices, normals, inward, lookup, edges = [], [], [], {}, {}
    for face in mesh.loop_triangles:
        cuts = []
        for e in range(3):
            a, b = face.vertices[e], face.vertices[(e+1) % 3]
            if (values[a] >= 0) == (values[b] >= 0): continue
            t = values[a] / (values[a] - values[b]); p = mesh.vertices[a].co.lerp(mesh.vertices[b].co, t)
            key = tuple(round(v * 1e5) for v in p)
            if key not in lookup:
                lookup[key] = len(vertices); vertices.append(p)
                normals.append(mesh.vertices[a].normal.lerp(mesh.vertices[b].normal, t).normalized())
                inward.append(mesh.vertices[a if values[a] >= 0 else b].co - p)
            cuts.append(lookup[key])
        cuts = list(dict.fromkeys(cuts))
        if len(cuts) == 2:
            a, b = cuts; edges.setdefault(a, set()).add(b); edges.setdefault(b, set()).add(a)
    used, triangles, shading = set(), [], []
    for start in edges:
        if start in used: continue
        loop, current, previous = [], start, -1
        while current not in used:
            used.add(current); loop.append(current)
            next_vertex = next((n for n in edges[current] if n != previous), None)
            if next_vertex is None: break
            previous, current = current, next_vertex
        if current != start or len(loop) < 3: continue
        normal = Vector()
        for i, a in enumerate(loop):
            p, q = vertices[a], vertices[loop[(i+1) % len(loop)]]
            normal += Vector(((p.y-q.y)*(p.z+q.z), (p.z-q.z)*(p.x+q.x), (p.x-q.x)*(p.y+q.y)))
        if normal.length_squared < 1e-14: continue
        normal.normalize()
        if normal.dot(sum((inward[i] for i in loop), Vector())) > 0: normal.negate()
        axis = Vector((0,1,0)) if abs(normal.y) < .9 else Vector((1,0,0))
        right = axis.cross(normal).normalized(); up = normal.cross(right)
        # Project for concave ear clipping; retain exact source boundary positions.
        projected = [Vector((vertices[i].dot(right), vertices[i].dot(up), 0)) for i in loop]
        faces = tessellate_polygon([projected]); ids = {tuple(p): loop[i] for i,p in enumerate(projected)}
        radius = max(1e-5, min(max(p.x for p in projected)-min(p.x for p in projected), max(p.y for p in projected)-min(p.y for p in projected))*.5)
        def emit(p):
            distance, edge_normal = float('inf'), normal
            for i, a in enumerate(loop):
                b = loop[(i+1) % len(loop)]; edge = vertices[b]-vertices[a]
                t = max(0., min(1., (p-vertices[a]).dot(edge)/max(edge.length_squared,1e-15)))
                d = (p-vertices[a]-edge*t).length
                if d < distance: distance, edge_normal = d, normals[a].lerp(normals[b],t).normalized()
            t = max(0.,min(1.,distance/(radius*.65))); blend=t*t*(3-2*t)
            triangles.append(p-normal*(radius*.015*blend)); shading.append(edge_normal.lerp(normal,.65+.35*blend).normalized())
        def subdivide(a,b,c,depth):
            if depth == 0:
                for p in (a,b,c): emit(p)
                return
            ab,bc,ca = a.lerp(b,.5),b.lerp(c,.5),c.lerp(a,.5)
            for tri in ((a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)): subdivide(*tri,depth-1)
        for face in faces:
            a,b,c = [vertices[loop[p] if isinstance(p, int) else ids[tuple(p)]] for p in face]
            if (b-a).cross(c-a).dot(normal)<0: b,c=c,b
            subdivide(a,b,c,3)
    if not triangles: return None
    cap_mesh=bpy.data.meshes.new('Shared focus closures');cap_mesh.from_pydata(triangles,[],np.arange(len(triangles)).reshape(-1,3).tolist())
    for p in cap_mesh.polygons:p.use_smooth=True
    cap_mesh.normals_split_custom_set_from_vertices(shading)
    cap=bpy.data.objects.new('Closed focus ends',cap_mesh);bpy.context.collection.objects.link(cap);cap.matrix_world=body.matrix_world.copy()
    mat=bpy.data.materials.new('Focus closure skin');mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*colour,1);bsdf.inputs['Roughness'].default_value=.58;cap_mesh.materials.append(mat)
    return cap
