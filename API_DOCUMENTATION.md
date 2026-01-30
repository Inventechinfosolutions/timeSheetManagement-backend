# Employee Attendance API Documentation

Base URL: `http://localhost:3000/api/employee-attendance`

All endpoints require authentication via JWT token in the `Authorization` header (except GET endpoints marked as public).

---

## 1. CREATE - Single Attendance Record

**Endpoint:** `POST /api/employee-attendance`  
**Auth:** Required (JWT)  
**Description:** Create a new attendance record

### Headers
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

### Payload Examples

#### Example 1: Submit Timesheet (Present - Full Day)
```json
{
  "employeeId": "EMP-12",
  "workingDate": "2026-01-15T00:00:00.000Z",
  "totalHours": 8.5,
  "workLocation": "Office",
  "status": "Full Day"
}
```

#### Example 2: Submit Timesheet (Present - Half Day)
```json
{
  "employeeId": "EMP-12",
  "workingDate": "2026-01-16T00:00:00.000Z",
  "totalHours": 4.0,
  "workLocation": "Home",
  "status": "Half Day"
}
```

#### Example 3: WFH/Client Visit Applied (No Timesheet Submitted)
```json
{
  "employeeId": "EMP-12",
  "workingDate": "2026-01-17T00:00:00.000Z",
  "totalHours": 0,
  "workLocation": "WFH"
}
```
**Result:** Status will be `"Not Updated"` (timesheet not submitted)

#### Example 4: Leave Applied
```json
{
  "employeeId": "EMP-12",
  "workingDate": "2026-01-18T00:00:00.000Z",
  "status": "Leave"
}
```
**Result:** Status will be `"Leave"` (no hours needed)

#### Example 5: Client Visit with Timesheet
```json
{
  "employeeId": "EMP-12",
  "workingDate": "2026-01-19T00:00:00.000Z",
  "totalHours": 8.0,
  "workLocation": "Client Visit"
}
```
**Result:** Status will be `"Full Day"` (Present)

### Response Example
```json
{
  "id": 123,
  "employeeId": "EMP-12",
  "workingDate": "2026-01-15T00:00:00.000Z",
  "totalHours": 8.5,
  "workLocation": "Office",
  "status": "Full Day",
  "createdAt": "2026-01-15T10:30:00.000Z",
  "updatedAt": "2026-01-15T10:30:00.000Z"
}
```

---

## 2. BULK CREATE/UPDATE - Multiple Attendance Records

**Endpoint:** `POST /api/employee-attendance/attendence-data/:employeeId`  
**Auth:** Required (JWT)  
**Description:** Create or update multiple attendance records at once

### URL
```
POST /api/employee-attendance/attendence-data/EMP-12
```

### Headers
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

### Payload Example (10 Days)
```json
[
  {
    "id": 1,
    "employeeId": "EMP-12",
    "workingDate": "2026-01-01T00:00:00.000Z",
    "totalHours": 8.5,
    "workLocation": "Office",
    "status": "Full Day"
  },
  {
    "id": 2,
    "employeeId": "EMP-12",
    "workingDate": "2026-01-02T00:00:00.000Z",
    "totalHours": 8.0,
    "workLocation": "Client Visit",
    "status": "Full Day"
  },
  {
    "employeeId": "EMP-12",
    "workingDate": "2026-01-03T00:00:00.000Z",
    "totalHours": 0,
    "workLocation": "WFH"
  },
  {
    "employeeId": "EMP-12",
    "workingDate": "2026-01-04T00:00:00.000Z",
    "status": "Leave"
  },
  {
    "employeeId": "EMP-12",
    "workingDate": "2026-01-05T00:00:00.000Z",
    "totalHours": 4.0,
    "workLocation": "Home",
    "status": "Half Day"
  },
  {
    "employeeId": "EMP-12",
    "workingDate": "2026-01-06T00:00:00.000Z",
    "totalHours": 8.0,
    "workLocation": "Office"
  },
  {
    "employeeId": "EMP-12",
    "workingDate": "2026-01-07T00:00:00.000Z",
    "totalHours": 0,
    "workLocation": "Client Visit"
  },
  {
    "employeeId": "EMP-12",
    "workingDate": "2026-01-08T00:00:00.000Z",
    "totalHours": 8.5,
    "workLocation": "Office"
  },
  {
    "employeeId": "EMP-12",
    "workingDate": "2026-01-09T00:00:00.000Z",
    "totalHours": 8.0,
    "workLocation": "WFH"
  },
  {
    "employeeId": "EMP-12",
    "workingDate": "2026-01-10T00:00:00.000Z",
    "totalHours": 0
  }
]
```

**Note:** 
- Include `"id"` to update existing records
- Omit `"id"` to create new records
- If `totalHours: 0` → Status = `"Not Updated"`
- If `status: "Leave"` → Status = `"Leave"` (no hours needed)
- If `totalHours > 0` → Status = `"Full Day"` or `"Half Day"` (Present)

### Response Example
```json
[
  {
    "id": 1,
    "employeeId": "EMP-12",
    "workingDate": "2026-01-01T00:00:00.000Z",
    "totalHours": 8.5,
    "workLocation": "Office",
    "status": "Full Day",
    "createdAt": "2026-01-01T10:00:00.000Z",
    "updatedAt": "2026-01-01T10:00:00.000Z"
  },
  {
    "id": 2,
    "employeeId": "EMP-12",
    "workingDate": "2026-01-02T00:00:00.000Z",
    "totalHours": 8.0,
    "workLocation": "Client Visit",
    "status": "Full Day",
    "createdAt": "2026-01-02T10:00:00.000Z",
    "updatedAt": "2026-01-02T10:00:00.000Z"
  },
  {
    "id": 125,
    "employeeId": "EMP-12",
    "workingDate": "2026-01-03T00:00:00.000Z",
    "totalHours": 0,
    "workLocation": "WFH",
    "status": "Not Updated",
    "createdAt": "2026-01-15T10:00:00.000Z",
    "updatedAt": "2026-01-15T10:00:00.000Z"
  }
]
```

---

## 3. UPDATE - Single Attendance Record

**Endpoint:** `PUT /api/employee-attendance/:id`  
**Auth:** Required (JWT)  
**Description:** Update an existing attendance record

### URL
```
PUT /api/employee-attendance/123
```

### Headers
```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

### Payload Examples

#### Example 1: Update Hours Only
```json
{
  "totalHours": 8.5,
  "workLocation": "Office"
}
```

#### Example 2: Update Status to Leave
```json
{
  "status": "Leave"
}
```

#### Example 3: Update All Fields
```json
{
  "totalHours": 4.0,
  "workLocation": "Home",
  "status": "Half Day"
}
```

#### Example 4: Update WFH to Submitted Timesheet
```json
{
  "totalHours": 8.0,
  "workLocation": "WFH"
}
```
**Result:** Status changes from `"Not Updated"` to `"Full Day"` (Present)

### Response Example
```json
{
  "id": 123,
  "employeeId": "EMP-12",
  "workingDate": "2026-01-15T00:00:00.000Z",
  "totalHours": 8.5,
  "workLocation": "Office",
  "status": "Full Day",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T11:30:00.000Z"
}
```

---

## 4. GET - Single Attendance Record

**Endpoint:** `GET /api/employee-attendance/:id`  
**Auth:** Public  
**Description:** Get a single attendance record by ID

### URL
```
GET /api/employee-attendance/123
```

### Response Example
```json
{
  "id": 123,
  "employeeId": "EMP-12",
  "workingDate": "2026-01-15T00:00:00.000Z",
  "totalHours": 8.5,
  "workLocation": "Office",
  "status": "Full Day",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T11:30:00.000Z"
}
```

---

## 5. GET - All Attendance Records

**Endpoint:** `GET /api/employee-attendance/all`  
**Auth:** Public  
**Description:** Get all attendance records

### Response Example
```json
[
  {
    "id": 1,
    "employeeId": "EMP-12",
    "workingDate": "2026-01-01T00:00:00.000Z",
    "totalHours": 8.5,
    "workLocation": "Office",
    "status": "Full Day",
    "createdAt": "2026-01-01T10:00:00.000Z",
    "updatedAt": "2026-01-01T10:00:00.000Z"
  },
  {
    "id": 2,
    "employeeId": "EMP-12",
    "workingDate": "2026-01-02T00:00:00.000Z",
    "totalHours": 0,
    "workLocation": "WFH",
    "status": "Not Updated",
    "createdAt": "2026-01-02T10:00:00.000Z",
    "updatedAt": "2026-01-02T10:00:00.000Z"
  }
]
```

---

## 6. GET - Monthly Attendance Details

**Endpoint:** `GET /api/employee-attendance/monthly-details/:employeeId/:month/:year`  
**Auth:** Public  
**Description:** Get comprehensive monthly attendance data for an employee

### URL
```
GET /api/employee-attendance/monthly-details/EMP-12/01/2026
```

### Response Example
```json
{
  "month": "01",
  "year": "2026",
  "employeeId": "EMP-12",
  "holidays": [
    {
      "date": "2026-01-15",
      "name": "Makara Sankranti",
      "type": "holiday"
    },
    {
      "date": "2026-01-26",
      "name": "Republic Day",
      "type": "holiday"
    }
  ],
  "leaveRequests": [
    {
      "date": "2026-01-30",
      "type": "leave",
      "requestType": "Apply Leave",
      "title": "Apply Leave",
      "description": "Apply Leave\n",
      "fromDate": "2026-01-30",
      "toDate": "2026-01-30"
    }
  ],
  "clientVisitRequests": [
    {
      "date": "2026-01-01",
      "type": "clientVisit",
      "requestType": "Client Visit",
      "title": "Client Visit",
      "description": "Client Visit\n",
      "fromDate": "2026-01-01",
      "toDate": "2026-01-16"
    }
  ],
  "wfhRequests": [
    {
      "date": "2026-01-31",
      "type": "wfh",
      "requestType": "Work From Home",
      "title": "Work From Home",
      "description": "Work From Home\n",
      "fromDate": "2026-01-31",
      "toDate": "2026-01-31"
    }
  ],
  "attendanceRecords": [
    {
      "date": "2026-01-01",
      "type": "attendance",
      "totalHours": 8.5,
      "status": "Full Day",
      "workLocation": "Office",
      "workingDate": "2026-01-01",
      "id": 1
    },
    {
      "date": "2026-01-02",
      "type": "attendance",
      "totalHours": 0,
      "status": "Not Updated",
      "workLocation": "WFH",
      "workingDate": "2026-01-02",
      "id": 2
    }
  ],
  "dailyData": [
    {
      "date": "2026-01-01",
      "day": 1,
      "dayName": "Thursday",
      "isWeekend": false,
      "holiday": null,
      "leave": null,
      "clientVisit": {
        "date": "2026-01-01",
        "type": "clientVisit",
        "requestType": "Client Visit",
        "title": "Client Visit",
        "description": "Client Visit\n",
        "fromDate": "2026-01-01",
        "toDate": "2026-01-16"
      },
      "wfh": null,
      "attendance": {
        "date": "2026-01-01",
        "type": "attendance",
        "totalHours": 8.5,
        "status": "Full Day",
        "workLocation": "Office",
        "workingDate": "2026-01-01",
        "id": 1
      }
    },
    {
      "date": "2026-01-02",
      "day": 2,
      "dayName": "Friday",
      "isWeekend": false,
      "holiday": null,
      "leave": null,
      "clientVisit": null,
      "wfh": null,
      "attendance": {
        "date": "2026-01-02",
        "type": "attendance",
        "totalHours": 0,
        "status": "Not Updated",
        "workLocation": "WFH",
        "workingDate": "2026-01-02",
        "id": 2
      }
    }
  ],
  "counts": {
    "leaves": 1,
    "wfh": 1,
    "clientVisits": 15,
    "presents": 11,
    "notUpdated": 8,
    "weekends": 9,
    "holidays": 2,
    "totalDays": 31
  }
}
```

---

## 7. GET - All Employees Monthly Attendance

**Endpoint:** `GET /api/employee-attendance/monthly-details-all/:month/:year`  
**Auth:** Public  
**Description:** Get monthly attendance for all employees

### URL
```
GET /api/employee-attendance/monthly-details-all/01/2026
```

### Response Example
```json
{
  "month": "01",
  "year": "2026",
  "employees": [
    {
      "employeeId": "EMP-12",
      "fullName": "John Doe",
      "attendance": {
        "counts": {
          "leaves": 1,
          "wfh": 1,
          "clientVisits": 15,
          "presents": 11,
          "notUpdated": 8,
          "weekends": 9,
          "holidays": 2
        }
      }
    }
  ]
}
```

---

## 8. GET - Dashboard Statistics

**Endpoint:** `GET /api/employee-attendance/dashboard-stats/:employeeId?month=01&year=2026`  
**Auth:** Public  
**Description:** Get dashboard statistics for an employee

### URL
```
GET /api/employee-attendance/dashboard-stats/EMP-12?month=01&year=2026
```

### Response Example
```json
{
  "totalWeekHours": 40.5,
  "totalMonthlyHours": 160.0,
  "pendingUpdates": 5,
  "monthStatus": "Pending"
}
```

---

## 9. GET - Work Trends

**Endpoint:** `GET /api/employee-attendance/work-trends/:employeeId?startDate=2026-01-01&endDate=2026-01-31`  
**Auth:** Public  
**Description:** Get work trends for an employee

### URL
```
GET /api/employee-attendance/work-trends/EMP-12?startDate=2026-01-01&endDate=2026-01-31
```

### Response Example
```json
{
  "employeeId": "EMP-12",
  "period": {
    "startDate": "2026-01-01",
    "endDate": "2026-01-31"
  },
  "totalHours": 160.0,
  "averageHoursPerDay": 8.0,
  "trends": [
    {
      "month": "01",
      "year": "2026",
      "totalHours": 160.0,
      "workingDays": 20
    }
  ]
}
```

---

## 10. GET - Attendance by Working Date

**Endpoint:** `GET /api/employee-attendance/working-date/:workingDate/:employeeId`  
**Auth:** Public  
**Description:** Get attendance record for a specific date

### URL
```
GET /api/employee-attendance/working-date/2026-01-15/EMP-12
```

### Response Example
```json
{
  "id": 123,
  "employeeId": "EMP-12",
  "workingDate": "2026-01-15T00:00:00.000Z",
  "totalHours": 8.5,
  "workLocation": "Office",
  "status": "Full Day",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T10:00:00.000Z"
}
```

---

## 11. GET - Worked Days

**Endpoint:** `GET /api/employee-attendance/worked-days/:employeeId/:startDate/:endDate`  
**Auth:** Public  
**Description:** Get worked days for a date range

### URL
```
GET /api/employee-attendance/worked-days/EMP-12/2026-01-01/2026-01-31
```

### Response Example
```json
[
  {
    "date": "2026-01-01",
    "totalHours": 8.5,
    "status": "Full Day",
    "workLocation": "Office"
  },
  {
    "date": "2026-01-02",
    "totalHours": 8.0,
    "status": "Full Day",
    "workLocation": "Client Visit"
  }
]
```

---

## 12. DELETE - Attendance Record

**Endpoint:** `DELETE /api/employee-attendance/:id`  
**Auth:** Public  
**Description:** Delete an attendance record

### URL
```
DELETE /api/employee-attendance/123
```

### Response Example
```json
{
  "message": "Record deleted successfully"
}
```

---

## 13. GET - Download Excel Report

**Endpoint:** `GET /api/employee-attendance/download-report?month=1&year=2026`  
**Auth:** Public  
**Description:** Download monthly attendance Excel report

### URL
```
GET /api/employee-attendance/download-report?month=1&year=2026
```

### Response
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- File download: `Attendance_1_2026.xlsx`

---

## Status Values

| Status | Description | When Used |
|--------|-------------|-----------|
| `Full Day` | Present (Full Day) | When `totalHours >= 6` |
| `Half Day` | Present (Half Day) | When `0 < totalHours < 6` |
| `Leave` | Leave Applied | When user applies leave (no hours needed) |
| `Not Updated` | Timesheet Not Submitted | When `totalHours = 0` or no attendance record |
| `Weekend` | Weekend | Saturday/Sunday |
| `Holiday` | Holiday | Master holiday dates |
| `Absent` | Absent | User purposefully didn't update |
| `Pending` | Pending | Pending approval |

---

## Business Rules

1. **WFH/Client Visit with `totalHours: 0`** → Status = `"Not Updated"` (timesheet not submitted)
2. **Leave Applied** → Status = `"Leave"` (no hours needed)
3. **`totalHours > 0`** → Status = `"Full Day"` (if >= 6) or `"Half Day"` (if < 6) - Both are "Present"
4. **Full Day = Present** (same thing)
5. **If `totalHours = 0`** → Status = `"Not Updated"` (user hasn't submitted timesheet)

---

## Error Responses

### 400 Bad Request
```json
{
  "message": "Validation failed (numeric string is expected)",
  "error": "Bad Request",
  "statusCode": 400
}
```

### 401 Unauthorized
```json
{
  "message": "Unauthorized",
  "statusCode": 401
}
```

### 404 Not Found
```json
{
  "message": "Record with ID 123 not found",
  "statusCode": 404
}
```

---

## cURL Examples

### Create Single Record
```bash
curl -X POST http://localhost:3000/api/employee-attendance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "employeeId": "EMP-12",
    "workingDate": "2026-01-15T00:00:00.000Z",
    "totalHours": 8.5,
    "workLocation": "Office",
    "status": "Full Day"
  }'
```

### Bulk Create/Update
```bash
curl -X POST http://localhost:3000/api/employee-attendance/attendence-data/EMP-12 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '[
    {
      "employeeId": "EMP-12",
      "workingDate": "2026-01-01T00:00:00.000Z",
      "totalHours": 8.5,
      "workLocation": "Office"
    },
    {
      "employeeId": "EMP-12",
      "workingDate": "2026-01-02T00:00:00.000Z",
      "totalHours": 0,
      "workLocation": "WFH"
    }
  ]'
```

### Update Record
```bash
curl -X PUT http://localhost:3000/api/employee-attendance/123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "totalHours": 8.5,
    "workLocation": "Office"
  }'
```

### Get Monthly Details
```bash
curl -X GET http://localhost:3000/api/employee-attendance/monthly-details/EMP-12/01/2026
```

---

## Notes

- All dates should be in ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`
- `totalHours` is optional but recommended
- `status` is optional and will be auto-calculated if not provided
- `workLocation` can be: "Office", "Home", "WFH", "Client Visit", "Work From Home"
- When updating, only send the fields you want to change (partial update)

