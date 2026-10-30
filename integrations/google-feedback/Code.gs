// Google Apps Script receiver. Secrets live in Script Properties, never in this file.
// Execute as the tracker owner. Deploy only after setting FEEDBACK_SECRET (32+ chars).
var TRACKER_ID = '1qCCp6lrReqJXSkw9PS0KkSn4Mx2fyA41LI9Qjwp5Q6k';
function doPost(e) {
  var lock;
  try {
    var payload = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('FEEDBACK_SECRET');
    if (!secret || secret.length < 32 || payload.token !== secret) return output({ok:false});
    var row = payload.row;
    if (!Array.isArray(row) || row.length !== 8 || row.some(function(v) { return typeof v !== 'string' || v.length > 20000; }) || !(/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,199}$/).test(row[0]) || ['new','investigating','resolved'].indexOf(row[6]) < 0) return output({ok:false});
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var sheet = SpreadsheetApp.openById(TRACKER_ID).getSheetByName('Feedback');
    var headers = ['Feedback ID','Tester ID','Received at','Step','Comment','App version','Status','Next action / your notes'];
    if (!sheet || JSON.stringify(sheet.getRange(7,1,1,8).getValues()[0]) !== JSON.stringify(headers)) throw new Error('Tracker layout changed');
    var last = sheet.getLastRow();
    var ids = last >= 8 ? sheet.getRange(8,1,last-7,1).getValues().map(function(v) { return v[0]; }) : [];
    // Compare the stored literal representation (including formula escaping).
    var safe = row.map(literal);
    var index = ids.indexOf(safe[0]);
    var target = index < 0 ? Math.max(last+1,8) : index+8;
    if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),1);
    // On repeats update only source columns. Google-side triage remains untouched.
    var count = index < 0 ? 8 : 6;
    sheet.getRange(target,1,1,count).setValues([safe.slice(0,count)]);
    SpreadsheetApp.flush();
    return output({ok:true,id:row[0]});
  } catch (_) { return output({ok:false}); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
function literal(value) { return /^[=+\-@\t\r]/.test(value) ? "'"+value : value; }
function output(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
