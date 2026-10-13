"""Regenerate the dependency-free Xcode project; no third-party generator needed."""
from pathlib import Path
import hashlib
import plistlib

root = Path(__file__).resolve().parent
objects = []
def key(name):
    return hashlib.sha1(name.encode()).hexdigest()[:24].upper()
def add(name, body):
    objects.append(f'{key(name)} = {{ {body} }};')
    return key(name)
def refs(names):
    return '(' + ', '.join(key(n) for n in names) + ',)'

files = sorted(p.name for p in (root / 'SmartInkStudio').glob('*.swift'))
for name in files:
    add(name, f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {name}; sourceTree = "<group>";')
    add('build-' + name, f'isa = PBXBuildFile; fileRef = {key(name)};')
add('product', 'isa = PBXFileReference; explicitFileType = wrapper.application; path = SmartInkStudio.app; sourceTree = BUILT_PRODUCTS_DIR;')
add('source-group', f'isa = PBXGroup; children = {refs(files)}; path = SmartInkStudio; sourceTree = "<group>";')
add('products', f'isa = PBXGroup; children = {refs(["product"])}; name = Products; sourceTree = "<group>";')
add('main', f'isa = PBXGroup; children = {refs(["source-group", "products"])}; sourceTree = "<group>";')
add('sources', f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = {refs(["build-" + f for f in files])}; runOnlyForDeploymentPostprocessing = 0;')
add('frameworks', 'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
add('resources', 'isa = PBXShellScriptBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; shellPath = /bin/sh; shellScript = "set -eu\\nBUNDLE=\\\"$SRCROOT/Bundled/$CONFIGURATION/Web\\\"\\nif [ ! -f \\\"$BUNDLE/index.html\\\" ]; then echo \\\"error: Run npm run build:ipad (Debug) or npm run build:ipad:release (Release) first.\\\"; exit 1; fi\\nmkdir -p \\\"$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/Web\\\"\\nrsync -a --delete \\\"$BUNDLE/\\\" \\\"$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/Web/\\\"\\n";')
for config in ['Debug', 'Release']:
    add('project-' + config, 'isa = XCBuildConfiguration; name = '+config+'; buildSettings = { SDKROOT = iphoneos; IPHONEOS_DEPLOYMENT_TARGET = 17.0; CLANG_ENABLE_MODULES = YES; };')
    extra = 'SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG; SWIFT_OPTIMIZATION_LEVEL = "-Onone";' if config == 'Debug' else 'SWIFT_OPTIMIZATION_LEVEL = "-O";'
    plist = 'Info-Debug.plist' if config == 'Debug' else 'Info.plist'
    add('target-' + config, 'isa = XCBuildConfiguration; name = '+config+'; buildSettings = { '
        'PRODUCT_BUNDLE_IDENTIFIER = com.smartink.studio; PRODUCT_NAME = "$(TARGET_NAME)"; SWIFT_VERSION = 5.0; '
        'TARGETED_DEVICE_FAMILY = 2; CODE_SIGN_STYLE = Automatic; GENERATE_INFOPLIST_FILE = NO; '
        f'INFOPLIST_FILE = SmartInkStudio/{plist}; '
        'SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; SUPPORTS_MACCATALYST = NO; '
        'CURRENT_PROJECT_VERSION = 1; MARKETING_VERSION = 0.1.0; '+extra+' };')
for kind in ['project', 'target']:
    add(kind+'-configs', f'isa = XCConfigurationList; buildConfigurations = {refs([kind+"-Debug", kind+"-Release"])}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
add('target', f'isa = PBXNativeTarget; buildConfigurationList = {key("target-configs")}; buildPhases = {refs(["sources", "frameworks", "resources"])}; buildRules = (); dependencies = (); name = SmartInkStudio; productName = SmartInkStudio; productReference = {key("product")}; productType = "com.apple.product-type.application";')
add('project', f'isa = PBXProject; attributes = {{ LastUpgradeCheck = 1600; }}; buildConfigurationList = {key("project-configs")}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; knownRegions = (en, Base); mainGroup = {key("main")}; productRefGroup = {key("products")}; projectDirPath = ""; projectRoot = ""; targets = {refs(["target"])};')
(root / 'SmartInkStudio.xcodeproj/project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+'\n'.join(objects)+f'\n}}; rootObject = {key("project")}; }}\n')
info = {
    'CFBundleDisplayName': 'Smart Ink Studio', 'CFBundleExecutable': '$(EXECUTABLE_NAME)',
    'CFBundleIdentifier': '$(PRODUCT_BUNDLE_IDENTIFIER)', 'CFBundleName': '$(PRODUCT_NAME)',
    'CFBundlePackageType': 'APPL', 'CFBundleShortVersionString': '$(MARKETING_VERSION)',
    'CFBundleVersion': '$(CURRENT_PROJECT_VERSION)', 'LSRequiresIPhoneOS': True,
    'NSAppTransportSecurity': {'NSAllowsLocalNetworking': True},
    'UILaunchScreen': {}, 'UIApplicationSceneManifest': {'UIApplicationSupportsMultipleScenes': False},
    'UISupportedInterfaceOrientations~ipad': ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'],
    'NSPhotoLibraryAddUsageDescription': 'Save a studio preview to your photos when you choose Save Image.',
    'NSLocalNetworkUsageDescription': 'Connect to your Smart Ink development studio on your local Wi-Fi network.',
}
(root / 'SmartInkStudio/Info.plist').write_bytes(plistlib.dumps(info))
info['NSAppTransportSecurity'] = {'NSAllowsLocalNetworking': True, 'NSAllowsArbitraryLoadsInWebContent': True}
(root / 'SmartInkStudio/Info-Debug.plist').write_bytes(plistlib.dumps(info))
ref = f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{key("target")}" BuildableName="SmartInkStudio.app" BlueprintName="SmartInkStudio" ReferencedContainer="container:SmartInkStudio.xcodeproj"/>'
(root / 'SmartInkStudio.xcodeproj/xcshareddata/xcschemes/SmartInkStudio.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{ref}</BuildActionEntry></BuildActionEntries></BuildAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{ref}</BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" useCustomWorkingDirectory="NO"><BuildableProductRunnable runnableDebuggingMode="0">{ref}</BuildableProductRunnable></ProfileAction>
<AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
''')
