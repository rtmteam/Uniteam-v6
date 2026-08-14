
/**
 * كود جوجل شيت (Google Apps Script) المحدث - إصلاح أمني شامل (Zero Trust)
 * - التحقق من وجود الموظف (User Existence Check) - NEW
 * - التحقق من الموقع الجغرافي داخل السيرفر (Server-Side Geo-Validation)
 * - عدم الثقة في بيانات العميل (No Client Trust)
 * - فرض توقيت السيرفر (Server Timestamp)
 * - كشف الانتقال المستحيل (Impossible Travel Detection)
 */

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "لا توجد بيانات مُرسلة (No post data received). تنبيه: لا تقم بتشغيل الدالة doPost يدويًا من محرر Apps Script، بل يتم استدعاؤها تلقائيًا عند إرسال بيانات من التطبيق."
    })).setMimeType(ContentService.MimeType.JSON);
  }
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // ======================================================
  // 1. تحديث النظام (Update System Configuration)
  // ======================================================
  if (data.action === 'updateSystem') {
    // ------------------------------------------------------
    // مصادقة إلزامية قبل أي كتابة.
    // بدونها كان أي شخص يعرف الرابط (وهو مشحون في حزمة JS العلنية)
    // يستطيع استبدال كلمة مرور المسؤول أو مسح شيت الموظفين بطلب واحد.
    // ------------------------------------------------------
    if (!isAdminRequest(ss, data.adminUsername, data.adminPassword)) {
      return ContentService.createTextOutput("Error: Unauthorized. Admin credentials required.");
    }

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);

      // 1. تحديث إعدادات النظام (Config Sheet)
      // يتم التحديث فقط إذا تم إرسال الفروع أو الوظائف أو الإجازات
      if (data.branches || data.jobs || data.holidays || (data.adminUsername && data.adminPassword)) {
        var configSheet = getOrCreateSheet(ss, "Config");
        var configData = configSheet.getDataRange().getValues();
        var configMap = {};
        for (var i = 1; i < configData.length; i++) {
          configMap[configData[i][0]] = configData[i][1];
        }

        // تحديث القيم المرسلة فقط والحفاظ على الباقي
        if (data.branches) configMap["branches"] = JSON.stringify(data.branches);
        if (data.jobs) configMap["jobs"] = JSON.stringify(data.jobs);
        if (data.holidays && Array.isArray(data.holidays)) configMap["holidays"] = JSON.stringify(data.holidays);
        if (data.adminUsername) configMap["admin_user"] = data.adminUsername;
        if (data.adminPassword) configMap["admin_pass"] = data.adminPassword;

        configSheet.clear();
        configSheet.appendRow(["Key", "Value"]);
        for (var key in configMap) {
          configSheet.appendRow([key, configMap[key]]);
        }
      }
      
      // 2. تحديث حسابات التقارير
      if (data.reportAccounts) {
        var reportAccSheet = getOrCreateSheet(ss, "ReportAccounts");
        reportAccSheet.clear();
        reportAccSheet.appendRow(["ID", "Username", "Password", "Allowed Jobs", "Allowed Employees"]);
        data.reportAccounts.forEach(function(acc) {
          reportAccSheet.appendRow([
            acc.id, 
            acc.username, 
            acc.password, 
            JSON.stringify(acc.allowedJobs || []),
            JSON.stringify(acc.allowedEmployees || [])
          ]);
        });
      }

      // 3. تحديث الموظفين
      if (data.users) {
        var userSheet = getOrCreateSheet(ss, "Users");

        // قبل المسح: نحتفظ بآخر موقع وآخر تحديث لكل موظف بمفتاح الرقم القومي.
        // هذان العمودان يكتبهما الخادم وحده عند التسجيل ولا يعرفهما التطبيق،
        // فتصفيرهما كان يمسح ذاكرة «كشف الانتقال المستحيل» عند كل مزامنة.
        var previousState = {};
        var oldRows = userSheet.getDataRange().getValues();
        for (var pr = 1; pr < oldRows.length; pr++) {
          var oldNid = oldRows[pr][2] ? oldRows[pr][2].toString().trim() : "";
          if (oldNid) {
            previousState[oldNid] = {
              lastUpdate: oldRows[pr][9] || "",
              lastGPS: oldRows[pr][13] || ""
            };
          }
        }

        userSheet.clear();
        userSheet.appendRow(["ID", "Full Name", "National ID", "Serial Number", "Job Title", "Device ID", "Password", "Default Branch", "Reg Date", "Last Update", "CheckIn", "CheckOut", "AllowedDeviceCount", "LastGPS"]);
        data.users.forEach(function(u) {
          var deviceStorage = "";
          if (u.deviceIds && Array.isArray(u.deviceIds)) {
            deviceStorage = JSON.stringify(u.deviceIds);
          } else if (u.deviceId) {
            deviceStorage = u.deviceId.toString();
          }

          var nidKey = u.nationalId ? u.nationalId.toString().trim() : "";
          var prev = previousState[nidKey] || { lastUpdate: "", lastGPS: "" };

          userSheet.appendRow([
            u.id ? u.id.toString() : "",
            u.fullName ? u.fullName.toString() : "",
            u.nationalId ? u.nationalId.toString() : "",
            u.serialNumber ? u.serialNumber.toString() : "",
            u.jobTitle ? u.jobTitle.toString() : "",
            deviceStorage,
            u.password ? u.password.toString() : "",
            u.defaultBranchId ? u.defaultBranchId.toString() : "",
            u.registrationDate ? u.registrationDate : new Date(),
            prev.lastUpdate || new Date(),
            u.checkInTime || "09:00",
            u.checkOutTime || "17:00",
            u.allowedDeviceCount || 1,
            prev.lastGPS
          ]);
        });
      }

      // 4. تحديث خطط الزيارات
      if (data.visitPlans) {
        var planSheet = getOrCreateSheet(ss, "VisitPlans");
        planSheet.clear();
        planSheet.appendRow(["ID", "User ID", "User Name", "Branch ID", "Branch Name", "Date"]);
        data.visitPlans.forEach(function(p) {
          planSheet.appendRow([
            p.id ? p.id.toString() : "",
            p.userId ? p.userId.toString() : "",
            p.userName ? p.userName.toString() : "",
            p.branchId ? p.branchId.toString() : "",
            p.branchName ? p.branchName.toString() : "",
            p.date ? p.date.toString() : ""
          ]);
        });
      }

      return ContentService.createTextOutput("System Updated Successfully");

    } catch (e) {
      return ContentService.createTextOutput("Error: Server Busy or Update Failed");
    } finally {
      lock.releaseLock();
    }
  }

  // ======================================================
  // 2. تسجيل الحضور (Secure Attendance Recording)
  // ======================================================
  if (data.action === 'saveAttendance') {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000); 
      
      // أ. التحقق الأمني: هل الموظف موجود في قاعدة البيانات؟
      // (Security Check: Verify User Exists)
      var userSheet = getOrCreateSheet(ss, "Users");
      var userRows = userSheet.getDataRange().getValues();
      var userRowIndex = -1;
      var targetNID = data.nationalId ? data.nationalId.toString() : "";
      
      // متغيرات نحتاجها لاحقاً للتحقق من السرعة
      var lastUpdateDate = null;
      var lastGPSStr = "";
      
      for (var k = 1; k < userRows.length; k++) {
        if (userRows[k][2].toString() === targetNID) {
          userRowIndex = k + 1; // 1-based index
          lastUpdateDate = userRows[k][9] ? new Date(userRows[k][9]) : null;
          lastGPSStr = userRows[k][13] ? userRows[k][13].toString() : ""; 
          break;
        }
      }

      // إذا لم يتم العثور على الموظف، نرفض العملية فوراً
      if (userRowIndex === -1) {
         return ContentService.createTextOutput("Error: Access Denied. Your account is no longer registered in the system.");
      }

      // التحقق من Device ID
      var rawDevice = userRows[userRowIndex-1][5] ? userRows[userRowIndex-1][5].toString() : "";
      var allowedDeviceIds = [];
      if (rawDevice.startsWith("[") && rawDevice.endsWith("]")) {
         try {
           allowedDeviceIds = JSON.parse(rawDevice);
         } catch(e) {
           allowedDeviceIds = [rawDevice];
         }
      } else {
         allowedDeviceIds = rawDevice ? [rawDevice] : [];
      }

      var incomingDeviceId = data.deviceId ? data.deviceId.toString() : "";
      if (allowedDeviceIds.indexOf(incomingDeviceId) === -1) {
         return ContentService.createTextOutput("Security Alert: عفواً، هذا الجهاز غير مسجل أو غير مصرح لك بتسجيل الحضور منه.");
      }

      // ب. جلب إعدادات الفروع
      var configSheet = getOrCreateSheet(ss, "Config");
      var configRows = configSheet.getDataRange().getValues();
      var serverBranches = [];
      for (var i = 1; i < configRows.length; i++) {
        if (configRows[i][0] === "branches") {
          try { serverBranches = JSON.parse(configRows[i][1]); } catch(e) {}
        }
      }

      // ج. البحث عن الفرع
      var targetBranch = null;
      if (data.branchId) {
        for (var b = 0; b < serverBranches.length; b++) {
          if (serverBranches[b].id === data.branchId) {
            targetBranch = serverBranches[b];
            break;
          }
        }
      }

      if (!targetBranch) {
        return ContentService.createTextOutput("Security Error: Invalid or Unknown Branch ID.");
      }

      // د. منطق التحقق من الموقع والمسافة
      var userLat = parseFloat(data.latitude);
      var userLng = parseFloat(data.longitude);
      // حارس: فرع بلا اسم كان يرمي استثناءً هنا فيتحوّل إلى رسالة عامة غامضة
      var targetBranchName = targetBranch.name ? targetBranch.name.toString().trim() : "";
      var isOutDoor = targetBranchName.toLowerCase() === "out door";
      var reason = data.reason ? data.reason.trim() : "";
      var now = new Date();

      if (isOutDoor) {
        if (reason === "") {
          return ContentService.createTextOutput("Error: Reason is required for Out Door branch.");
        }
      } else {
        if (isNaN(userLat) || isNaN(userLng)) {
          return ContentService.createTextOutput("Error: Invalid GPS Coordinates.");
        }
        var distance = calculateHaversineDistance(userLat, userLng, targetBranch.latitude, targetBranch.longitude);
        var allowedRadius = targetBranch.radius || 100;

        if (distance > (allowedRadius + 15)) {
           return ContentService.createTextOutput("Security Alert: You are too far from the branch. Calculated Distance: " + Math.round(distance) + "m");
        }
      }

      // هـ. كشف الانتقال المستحيل (Impossible Travel Detection)
      // نستخدم البيانات التي جلبناها في الخطوة (أ)
      if (lastUpdateDate && lastGPSStr && lastGPSStr.includes(",")) {
         var parts = lastGPSStr.split(",");
         var lastLat = parseFloat(parts[0]);
         var lastLng = parseFloat(parts[1]);

         if (!isNaN(lastLat) && !isNaN(lastLng)) {
           // حساب المسافة بين الموقع الحالي والموقع السابق
           var travelDistKm = calculateHaversineDistance(lastLat, lastLng, userLat, userLng) / 1000;
           // حساب الفرق الزمني بالساعات
           var timeDiffHours = (now - lastUpdateDate) / (1000 * 60 * 60);
           
           if (timeDiffHours < 0.016) timeDiffHours = 0.016; // Minimum 1 minute

           var speedKmH = travelDistKm / timeDiffHours;
           var MAX_POSSIBLE_SPEED = 500; 

           if (travelDistKm > 1 && speedKmH > MAX_POSSIBLE_SPEED) {
             return ContentService.createTextOutput("Security Alert: Impossible Travel Detected! Speed: " + Math.round(speedKmH) + " km/h is physically impossible.");
           }
         }
      }

      // و. الحفظ وتحديث بيانات المستخدم
      var attSheet = getOrCreateSheet(ss, "Attendance");
      
      // نستخدم الرقم التسلسلي من شيت المستخدمين لضمان الدقة
      var sn = userRows[userRowIndex-1][3];

      // كود الفرع يُؤخذ من إعدادات الخادم لا من العميل — العميل يرسل
      // معرّف الفرع فقط، والكود يُحلّ هنا من قائمة الفروع المعتمدة.
      var targetBranchCode = targetBranch.code ? targetBranch.code.toString().trim() : "";

      // حارس: إن لم يُدرج العمود يدوياً بعد، نرفض الكتابة بدل أن نكتب
      // صفوفاً مزاحة عموداً واحداً يستحيل تصحيحها لاحقاً.
      var columnError = assertAttendanceColumns(attSheet);
      if (columnError !== "") {
        return ContentService.createTextOutput(columnError);
      }

      attSheet.appendRow([
        now,
        data.userName,
        sn || "",
        data.userJob,
        targetBranchCode,
        targetBranchName,
        data.type,
        now.toISOString(),
        data.latitude + "," + data.longitude,
        reason,
        data.timeDiff || ""
      ]);
      
      // تحديث آخر موقع ووقت للمستخدم
      userSheet.getRange(userRowIndex, 10).setValue(now);
      userSheet.getRange(userRowIndex, 14).setValue(data.latitude + "," + data.longitude);
      
      return ContentService.createTextOutput("Attendance Recorded");
      
    } catch (e) {
      return ContentService.createTextOutput("Error: Server processing failed. " + e.message);
    } finally {
      lock.releaseLock();
    }
  }

  // ======================================================
  // 3. تسجيل مستخدم جديد (Register User)
  // ======================================================
  if (data.action === 'registerUser') {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000); 
      
      var sheet = getOrCreateSheet(ss, "Users");
      var rows = sheet.getDataRange().getValues();
      var nationalIdStr = data.nationalId.toString();
      
      for (var i = 1; i < rows.length; i++) {
         if (rows[i][2].toString() === nationalIdStr) {
           return ContentService.createTextOutput("Error: National ID Already Registered");
         }
      }

      var currentYear = new Date().getFullYear().toString();
      var maxSequence = 0;
      
      for (var j = 1; j < rows.length; j++) {
        var existingSN = rows[j][3] ? rows[j][3].toString() : "";
        if (existingSN.indexOf(currentYear) === 0) {
          var sequencePart = existingSN.substring(currentYear.length);
          var sequenceNum = parseInt(sequencePart);
          if (!isNaN(sequenceNum) && sequenceNum > maxSequence) {
            maxSequence = sequenceNum;
          }
        }
      }
      
      var newSerialNumber = currentYear + (maxSequence + 1);
      
      var deviceStorage = "";
      if (data.deviceIds && Array.isArray(data.deviceIds)) {
        deviceStorage = JSON.stringify(data.deviceIds);
      } else if (data.deviceId) {
         deviceStorage = data.deviceId.toString();
      }

      var now = new Date();
      sheet.appendRow([
        data.id.toString(), 
        data.fullName.toString(), 
        nationalIdStr, 
        newSerialNumber, 
        data.jobTitle.toString(),
        deviceStorage, 
        data.password ? data.password.toString() : "", 
        data.defaultBranchId ? data.defaultBranchId.toString() : "", 
        now, 
        now, 
        "09:00", 
        "17:00",
        data.allowedDeviceCount || 1,
        "" // LastGPS
      ]);
      
      return ContentService.createTextOutput("User Registered Successfully");
      
    } catch (e) {
      return ContentService.createTextOutput("Error: Server Busy, try again");
    } finally {
      lock.releaseLock();
    }
  }

  if (data.action === 'updateUserDevice') {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      var sheet = getOrCreateSheet(ss, "Users");
      var rows = sheet.getDataRange().getValues();
      var nid = data.nationalId ? data.nationalId.toString().trim() : "";
      var uid = data.userId ? data.userId.toString().trim() : "";
      var newDevices = data.deviceIds || []; 
      
      for(var i=1; i<rows.length; i++){
        var rowNid = rows[i][2] ? rows[i][2].toString().trim() : "";
        var rowUid = rows[i][0] ? rows[i][0].toString().trim() : "";
        if((nid && rowNid === nid) || (uid && rowUid === uid)){
           sheet.getRange(i+1, 6).setValue(JSON.stringify(newDevices));
           return ContentService.createTextOutput("Device Updated");
        }
      }
      return ContentService.createTextOutput("User Not Found");
    } catch(e) {
      return ContentService.createTextOutput("Error Updating Device: " + e.message);
    } finally {
      lock.releaseLock();
    }
  }

  if (data.action === 'logAudit') {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      var targetSS = ss;
      if (data.spreadsheetId && data.spreadsheetId !== "") {
        try {
          targetSS = SpreadsheetApp.openById(data.spreadsheetId);
        } catch(e) {
          // Fallback to current if ID is invalid
        }
      }
      var auditSheet = getOrCreateSheet(targetSS, "AuditLog");
      auditSheet.appendRow([
        new Date(),
        data.user || "Unknown",
        data.auditAction || "Unknown",
        data.details || "",
        data.deviceInfo || ""
      ]);
      return ContentService.createTextOutput("Audit Logged");
    } catch (e) {
      return ContentService.createTextOutput("Error Logging Audit: " + e.message);
    } finally {
      lock.releaseLock();
    }
  }

  // إجراء غير معروف: ردّ صريح بدل ردّ فارغ يفسّره التطبيق كـ«كود سيرفر قديم»
  return ContentService.createTextOutput("Error: Unknown action '" + (data.action || "") + "'.");
}

/**
 * التحقق من أن الطلب صادر عن المسؤول.
 * يقرأ admin_user/admin_pass من شيت Config.
 * ملاحظة: إن لم تكن مضبوطة بعد (شيت جديد) يُسمح بالطلب الأول لتهيئتها،
 * وإلا تعذّر ضبط النظام من الصفر.
 */
function isAdminRequest(ss, username, password) {
  var configSheet = getOrCreateSheet(ss, "Config");
  var rows = configSheet.getDataRange().getValues();
  var adminUser = "", adminPass = "";
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === "admin_user") adminUser = rows[i][1] ? rows[i][1].toString() : "";
    if (rows[i][0] === "admin_pass") adminPass = rows[i][1] ? rows[i][1].toString() : "";
  }

  // تهيئة أولى: لا مسؤول مضبوط بعد
  if (adminUser === "" && adminPass === "") return true;

  var u = username ? username.toString() : "";
  var p = password ? password.toString() : "";
  return u === adminUser && p === adminPass;
}

// ======================================================
// دالة حساب المسافة (Haversine Formula) - Server Side
// ======================================================
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  var R = 6371e3; // نصف قطر الأرض بالمتر
  var toRad = function(v) { return v * Math.PI / 180; };
  
  var φ1 = toRad(lat1);
  var φ2 = toRad(lat2);
  var Δφ = toRad(lat2 - lat1);
  var Δλ = toRad(lon2 - lon1);

  var a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // المسافة بالمتر
}

function doGet(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "لا توجد معاملات مُرسلة (No parameter received). تنبيه: لا تقم بتشغيل الدالة doGet يدويًا من محرر Apps Script."
    })).setMimeType(ContentService.MimeType.JSON);
  }
  var action = e.parameter.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (action === 'getData') {
    var result = { branches: [], jobs: [], users: [], reportAccounts: [], holidays: [], visitPlans: [] };
    var configSheet = getOrCreateSheet(ss, "Config");
    var configRows = configSheet.getDataRange().getValues();
    for (var i = 1; i < configRows.length; i++) {
      if (configRows[i][0] === "branches") {
        try { result.branches = JSON.parse(configRows[i][1]); } catch(e) { result.branches = []; }
      }
      if (configRows[i][0] === "jobs") {
        try { result.jobs = JSON.parse(configRows[i][1]); } catch(e) { result.jobs = []; }
      }
      if (configRows[i][0] === "holidays") {
        try { result.holidays = JSON.parse(configRows[i][1]); } catch(e) { result.holidays = []; }
      }
    }

    var userSheet = getOrCreateSheet(ss, "Users");
    var userRows = userSheet.getDataRange().getValues();
    if (userRows.length > 1) {
      for (var j = 1; j < userRows.length; j++) {
        var rawDevice = userRows[j][5] ? userRows[j][5].toString() : "";
        var deviceIds = [];
        var legacyDeviceId = "";
        
        if (rawDevice.startsWith("[") && rawDevice.endsWith("]")) {
           try {
             deviceIds = JSON.parse(rawDevice);
             legacyDeviceId = deviceIds.length > 0 ? deviceIds[0] : "";
           } catch(e) {
             legacyDeviceId = rawDevice;
             deviceIds = [rawDevice];
           }
        } else {
           legacyDeviceId = rawDevice;
           deviceIds = rawDevice ? [rawDevice] : [];
        }

        result.users.push({
          id: userRows[j][0].toString(),
          fullName: userRows[j][1].toString(),
          nationalId: userRows[j][2].toString(),
          serialNumber: userRows[j][3] ? userRows[j][3].toString() : "",
          jobTitle: userRows[j][4].toString(),
          deviceId: legacyDeviceId,
          deviceIds: deviceIds,
          password: userRows[j][6].toString(),
          defaultBranchId: userRows[j][7].toString(),
          registrationDate: userRows[j][8].toString(),
          checkInTime: userRows[j][10] ? userRows[j][10].toString() : "09:00",
          checkOutTime: userRows[j][11] ? userRows[j][11].toString() : "17:00",
          allowedDeviceCount: (userRows[j][12] && !isNaN(userRows[j][12])) ? parseInt(userRows[j][12]) : 1,
          role: 'employee'
        });
      }
    }

    var planSheet = getOrCreateSheet(ss, "VisitPlans");
    var planRows = planSheet.getDataRange().getValues();
    if (planRows.length > 1) {
      for (var p = 1; p < planRows.length; p++) {
        result.visitPlans.push({
          id: planRows[p][0].toString(),
          userId: planRows[p][1].toString(),
          userName: planRows[p][2].toString(),
          branchId: planRows[p][3].toString(),
          branchName: planRows[p][4].toString(),
          date: planRows[p][5].toString()
        });
      }
    }
    
    var reportAccSheet = getOrCreateSheet(ss, "ReportAccounts");
    var reportAccRows = reportAccSheet.getDataRange().getValues();
    if (reportAccRows.length > 1) {
      for (var k = 1; k < reportAccRows.length; k++) {
        var parsedJobs = [];
        var parsedEmps = [];
        try { parsedJobs = JSON.parse(reportAccRows[k][3]); } catch(e) { parsedJobs = []; }
        try { parsedEmps = reportAccRows[k][4] ? JSON.parse(reportAccRows[k][4]) : []; } catch(e) { parsedEmps = []; }

        result.reportAccounts.push({
          id: reportAccRows[k][0], 
          username: reportAccRows[k][1],
          password: reportAccRows[k][2], 
          allowedJobs: parsedJobs,
          allowedEmployees: parsedEmps
        });
      }
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'getReportData') {
    var user = e.parameter.user;
    var pass = e.parameter.pass;
    var configSheet = getOrCreateSheet(ss, "Config");
    var configRows = configSheet.getDataRange().getValues();
    var adminUser = "", adminPass = "", allSystemJobs = [], holidays = [], jobsData = [], branches = [];
    for (var c = 1; c < configRows.length; c++) {
      if (configRows[c][0] === "admin_user") adminUser = configRows[c][1];
      if (configRows[c][0] === "admin_pass") adminPass = configRows[c][1];
      if (configRows[c][0] === "branches") {
        try { branches = JSON.parse(configRows[c][1]); } catch(e) { branches = []; }
      }
      if (configRows[c][0] === "holidays") {
        try { holidays = JSON.parse(configRows[c][1]); } catch(e) {}
      }
      if (configRows[c][0] === "jobs") { 
        try { 
          jobsData = JSON.parse(configRows[c][1]);
          allSystemJobs = jobsData.map(function(j) { return j.title; }); 
        } catch(e) {} 
      }
    }
    var allowedJobs = [];
    var allowedEmployees = [];
    var isAuthorized = false;

    if (user === adminUser && pass === adminPass && adminUser !== "") { 
      allowedJobs = allSystemJobs;
      isAuthorized = true;
    } else {
       var reportAccSheet = getOrCreateSheet(ss, "ReportAccounts");
       var reportAccRows = reportAccSheet.getDataRange().getValues();
       for (var i = 1; i < reportAccRows.length; i++) {
         if (reportAccRows[i][1] === user && reportAccRows[i][2] === pass) { 
           isAuthorized = true;
           try {
             allowedJobs = JSON.parse(reportAccRows[i][3]); 
             if (!Array.isArray(allowedJobs)) allowedJobs = [];
           } catch(e) { allowedJobs = []; }

           if (reportAccRows[i][4]) {
             try {
                allowedEmployees = JSON.parse(reportAccRows[i][4]);
                if (!Array.isArray(allowedEmployees)) allowedEmployees = [];
             } catch(e) { allowedEmployees = []; }
           }
           break; 
         }
       }
    }
    
    if (!isAuthorized) return ContentService.createTextOutput(JSON.stringify({error: "Invalid login"})).setMimeType(ContentService.MimeType.JSON);
    
    var isAdmin = (user === adminUser && pass === adminPass);

    var attSheet = getOrCreateSheet(ss, "Attendance");
    var attRows = attSheet.getDataRange().getValues();
    var filteredRecords = [];
    
    for (var j = 1; j < attRows.length; j++) {
      var jobName = (attRows[j][3] || "").toString();
      var empName = (attRows[j][1] || "").toString();
      
      var include = false;
      if (isAdmin) {
        include = true;
      } else if (allowedEmployees.length > 0) {
        if (allowedEmployees.indexOf(empName) !== -1) include = true;
      } else {
        if (allowedJobs.indexOf(jobName) !== -1) include = true;
      }

      if (include) {
        filteredRecords.push({
          date: attRows[j][0], name: empName,
          serialNumber: attRows[j][2], job: jobName,
          // العمود الخامس (فهرس 4) هو Branch Code — يسبق اسم الفرع.
          // فارغ في الصفوف المسجّلة قبل إضافة العمود، وعندها يستنتجه
          // التطبيق من اسم الفرع فلا ينكسر تقرير قديم.
          branchCode: attRows[j][4] || "",
          branch: attRows[j][5], type: attRows[j][6], time: attRows[j][7], gps: attRows[j][8],
          reason: attRows[j][9] || "", timeDiff: attRows[j][10] || ""
        });
      }
    }

    var userSheet = getOrCreateSheet(ss, "Users");
    var userRows = userSheet.getDataRange().getValues();
    var authorizedUsers = [];

    for (var k = 1; k < userRows.length; k++) {
      var uName = (userRows[k][1] || "").toString();
      var uJob = (userRows[k][4] || "").toString();
      var uBranch = userRows[k][7];
      var uSerial = userRows[k][3];

      var includeUser = false;
      if (isAdmin) {
        includeUser = true;
      } else if (allowedEmployees.length > 0) {
         if (allowedEmployees.indexOf(uName) !== -1) includeUser = true;
      } else {
         if (allowedJobs.indexOf(uJob) !== -1) includeUser = true;
      }

      if (includeUser) {
        // عمود "Default Branch" يخزّن معرّف الفرع لا اسمه.
        // نحلّه هنا داخل الخادم حيث قائمة الفروع متاحة، فيصل التقرير
        // اسماً مقروءاً وكوداً جاهزاً بدل معرّف عشوائي.
        var uBranchStr = uBranch ? uBranch.toString().trim() : "";
        var matchedBranch = null;
        for (var mb = 0; mb < branches.length; mb++) {
          var bId = branches[mb].id ? branches[mb].id.toString().trim() : "";
          var bName = branches[mb].name ? branches[mb].name.toString().trim() : "";
          if (uBranchStr && (bId === uBranchStr || bName === uBranchStr)) {
            matchedBranch = branches[mb];
            break;
          }
        }

        authorizedUsers.push({
          fullName: uName,
          jobTitle: uJob,
          defaultBranch: matchedBranch ? (matchedBranch.name || uBranchStr) : uBranchStr,
          defaultBranchId: uBranchStr,
          branchCode: matchedBranch && matchedBranch.code ? matchedBranch.code.toString() : "",
          serialNumber: uSerial
        });
      }
    }

    var visitPlansSheet = getOrCreateSheet(ss, "VisitPlans");
    var visitPlansRows = visitPlansSheet.getDataRange().getValues();
    var visitPlans = [];
    for (var m = 1; m < visitPlansRows.length; m++) {
      var planUserId = (visitPlansRows[m][1] || "").toString();
      var planUserName = (visitPlansRows[m][2] || "").toString();
      var planBranchName = (visitPlansRows[m][4] || "").toString();
      var planDate = (visitPlansRows[m][5] || "").toString();

      var includePlan = false;
      if (isAdmin) {
        includePlan = true;
      } else if (allowedEmployees.length > 0) {
        if (allowedEmployees.indexOf(planUserName) !== -1) includePlan = true;
      } else {
        // Find user job to see if plan should be included
        // ملاحظة: كان الاسم هنا `user` فيظلّل `var user = e.parameter.user`
        // في نفس نطاق الدالة (رفع `var`). أُعيدت التسمية منعاً لانفجاره لاحقاً.
        var planOwner = null;
        for (var po = 0; po < authorizedUsers.length; po++) {
          var cand = authorizedUsers[po];
          if (cand.fullName === planUserName || (cand.serialNumber && cand.serialNumber.toString() === planUserId)) {
            planOwner = cand;
            break;
          }
        }
        if (planOwner && allowedJobs.indexOf(planOwner.jobTitle) !== -1) includePlan = true;
      }

      if (includePlan) {
        visitPlans.push({
          id: visitPlansRows[m][0],
          userId: planUserId,
          userName: planUserName,
          branchName: planBranchName,
          date: planDate
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      records: filteredRecords,
      users: authorizedUsers,
      jobs: jobsData,
      branches: branches,
      holidays: holidays,
      visitPlans: visitPlans
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // إجراء غير معروف: ردّ صريح بدل ردّ فارغ
  return ContentService.createTextOutput(JSON.stringify({
    error: "Unknown action '" + (action || "") + "'."
  })).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === "Users") {
      sheet.appendRow(["ID", "Full Name", "National ID", "Serial Number", "Job Title", "Device ID", "Password", "Default Branch", "Reg Date", "Last Update", "CheckIn", "CheckOut", "AllowedDeviceCount", "LastGPS"]);
    } else if (name === "Attendance") {
      sheet.appendRow(["Log Date", "Name", "Serial Number", "Job", "Branch Code", "Branch", "Type", "ISO Time", "GPS", "Reason", "Time Diff"]);
    } else if (name === "ReportAccounts") {
      sheet.appendRow(["ID", "Username", "Password", "Allowed Jobs", "Allowed Employees"]);
    } else if (name === "AuditLog") {
      sheet.appendRow(["Timestamp", "User", "Action", "Details", "Device Info"]);
    } else if (name === "VisitPlans") {
      sheet.appendRow(["ID", "User ID", "User Name", "Branch ID", "Branch Name", "Date"]);
    }
  } else {
    var lastCol, headers;
    if (name === "Users") {
       lastCol = sheet.getLastColumn();
       headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
       // التأكد من وجود LastGPS — يُضاف في النهاية فلا يزيح فهرساً
       if (headers.indexOf("LastGPS") === -1) {
          sheet.getRange(1, lastCol + 1).setValue("LastGPS");
       }
    }

    // ملاحظة مقصودة: لا ترحيل تلقائي لعمود "Branch Code" في شيت Attendance.
    // موضعه المطلوب هو العمود الخامس (قبل Branch) لا النهاية، وإدراج عمود
    // في الوسط برمجياً يزيح بيانات آلاف الصفوف القائمة. الإدراج يدوي،
    // ودالة assertAttendanceColumns أدناه تتحقّق من إتمامه.
  }
  return sheet;
}

/**
 * تحقّق من أن شيت Attendance يحمل الترتيب المتوقّع للأعمدة.
 *
 * هذا الملف يقرأ الأعمدة بفهارس ثابتة (attRows[j][5] للفرع مثلاً)،
 * فإن لم يُدرج عمود "Branch Code" يدوياً في الموضع الخامس ستُقرأ كل
 * البيانات مزاحة عموداً واحداً: الفرع يظهر مكان الكود، والنوع مكان الفرع…
 *
 * تُرجع رسالة خطأ عند الخلل، أو "" إن كان الترتيب سليماً.
 */
function assertAttendanceColumns(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return "";
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var fifth = headers[4] ? headers[4].toString().trim() : "";
  if (fifth !== "Branch Code") {
    return "Error: عمود 'Branch Code' مفقود من شيت Attendance. " +
           "أدرجه يدوياً ليصبح العمود الخامس (قبل Branch) ثم أعد المحاولة. " +
           "العمود الخامس حالياً: '" + fifth + "'";
  }
  return "";
}
