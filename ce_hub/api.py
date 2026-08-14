import frappe
from frappe.utils import today, now, getdate
import math

# Head Office Coordinates
HQ_LAT = 31.1048
HQ_LON = 77.1734
RADIUS_M = 1000

def _haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000  # radius of Earth in meters
    phi_1 = math.radians(lat1)
    phi_2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi_1) * math.cos(phi_2) * \
        math.sin(delta_lambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = R * c
    return distance

def get_current_employee():
    user = frappe.session.user
    if not user or user == 'Guest':
        frappe.throw('Authentication required. Please sign in.', frappe.AuthenticationError)
        
    employee = frappe.db.get_value('Employee', {'user_id': user}, 'name')
    if not employee:
        # Fallback search by company_email / personal_email
        employee = frappe.db.get_value('Employee', {'company_email': user}, 'name') or \
                   frappe.db.get_value('Employee', {'personal_email': user}, 'name')
                   
    if not employee:
        frappe.throw(f'No active Employee profile linked to user account: {user}')
    return employee

@frappe.whitelist()
def get_employee_info():
    employee = get_current_employee()
    doc = frappe.get_doc('Employee', employee)
    return {
        'name': doc.name,
        'employee_name': doc.employee_name,
        'designation': doc.designation,
        'department': doc.department,
        'company': doc.company,
        'reports_to': doc.reports_to,
        'image': doc.image,
        'user_id': doc.user_id
    }

@frappe.whitelist()
def get_today_status():
    employee = get_current_employee()
    dt = today()
    checkins = frappe.get_all('Employee Checkin', 
        filters={'employee': employee, 'time': ['between', (dt + ' 00:00:00', dt + ' 23:59:59')]},
        fields=['name', 'log_type', 'time'],
        order_by='time desc'
    )
    
    checked_in = False
    checked_out = False
    checked_in_time = None
    checked_out_time = None
    
    for c in checkins:
        if c.log_type == 'IN' and not checked_in:
            checked_in = True
            checked_in_time = str(c.time)
        if c.log_type == 'OUT' and not checked_out:
            checked_out = True
            checked_out_time = str(c.time)
            
    activity = frappe.get_all('Employee Activity Log', 
        filters={'employee': employee, 'date': dt},
        fields=['name', 'work_done']
    )
    
    return {
        'checked_in': checked_in,
        'checked_in_time': checked_in_time,
        'checked_out': checked_out,
        'checked_out_time': checked_out_time,
        'activity_logged': bool(activity),
        'activity_log_id': activity[0].name if activity else None,
        'activity_text': activity[0].work_done if activity else None
    }

@frappe.whitelist()
def mark_checkin(latitude=None, longitude=None):
    employee = get_current_employee()
    
    lat = float(latitude) if latitude else HQ_LAT
    lon = float(longitude) if longitude else HQ_LON
    
    doc = frappe.get_doc({
        'doctype': 'Employee Checkin',
        'employee': employee,
        'log_type': 'IN',
        'time': now(),
        'latitude': lat,
        'longitude': lon,
        'device_id': 'CE-Hub-PWA'
    })
    doc.insert(ignore_permissions=True)
    return doc.name

@frappe.whitelist()
def mark_checkout(latitude=None, longitude=None):
    employee = get_current_employee()
    dt = today()
    
    # 1. Mandatory verification: Daily Activity Log must exist for today
    activity = frappe.get_all('Employee Activity Log', 
        filters={'employee': employee, 'date': dt},
        fields=['name']
    )
    if not activity:
        frappe.throw('Check-Out Blocked: You MUST fill and submit your Daily Activity Log before checking out.')
        
    lat = float(latitude) if latitude else HQ_LAT
    lon = float(longitude) if longitude else HQ_LON
    
    doc = frappe.get_doc({
        'doctype': 'Employee Checkin',
        'employee': employee,
        'log_type': 'OUT',
        'time': now(),
        'latitude': lat,
        'longitude': lon,
        'device_id': 'CE-Hub-PWA'
    })
    doc.insert(ignore_permissions=True)
    return doc.name

@frappe.whitelist()
def save_activity_log(work_done, date=None):
    if not work_done or not work_done.strip():
        frappe.throw('Activity log details cannot be empty.')
        
    employee = get_current_employee()
    dt = date or today()
    
    # Check if entry already exists for today
    existing = frappe.get_all('Employee Activity Log', 
        filters={'employee': employee, 'date': dt}, 
        fields=['name']
    )
    
    if existing:
        doc = frappe.get_doc('Employee Activity Log', existing[0].name)
        doc.work_done = work_done.strip()
        doc.save(ignore_permissions=True)
        return doc.name
    else:
        doc = frappe.get_doc({
            'doctype': 'Employee Activity Log',
            'employee': employee,
            'date': dt,
            'work_done': work_done.strip()
        })
        doc.insert(ignore_permissions=True)
        return doc.name

@frappe.whitelist()
def get_activity_history(month=None, year=None):
    employee = get_current_employee()
    return frappe.get_all('Employee Activity Log', 
        filters={'employee': employee}, 
        fields=['name', 'date', 'work_done', 'creation'], 
        order_by='date desc',
        limit_page_length=50
    )

@frappe.whitelist()
def get_leave_balance():
    employee = get_current_employee()
    allocations = frappe.get_all('Leave Allocation', 
        filters={'employee': employee, 'to_date': ['>=', today()], 'docstatus': 1},
        fields=['leave_type', 'total_leaves_allocated', 'new_leaves_allocated', 'leaves_taken']
    )
    return allocations

@frappe.whitelist()
def submit_leave_request(leave_type, from_date, to_date, reason, half_day=0):
    employee = get_current_employee()
    doc = frappe.get_doc({
        'doctype': 'Leave Application',
        'employee': employee,
        'leave_type': leave_type,
        'from_date': from_date,
        'to_date': to_date,
        'description': reason,
        'half_day': int(half_day or 0),
        'status': 'Open',
        'docstatus': 0
    })
    doc.insert(ignore_permissions=True)
    return doc.name

@frappe.whitelist()
def submit_attendance_request(reason, from_date, to_date, explanation=''):
    employee = get_current_employee()
    doc = frappe.get_doc({
        'doctype': 'Attendance Request',
        'employee': employee,
        'reason': reason,
        'from_date': from_date,
        'to_date': to_date,
        'explanation': explanation,
        'docstatus': 0
    })
    doc.insert(ignore_permissions=True)
    return doc.name

@frappe.whitelist()
def get_my_requests():
    employee = get_current_employee()
    leaves = frappe.get_all('Leave Application', 
        filters={'employee': employee}, 
        fields=['name', 'leave_type', 'from_date', 'to_date', 'status', 'creation'], 
        order_by='creation desc',
        limit_page_length=20
    )
    attendance = frappe.get_all('Attendance Request', 
        filters={'employee': employee}, 
        fields=['name', 'reason', 'from_date', 'to_date', 'docstatus', 'creation'], 
        order_by='creation desc',
        limit_page_length=20
    )
    return {'leaves': leaves, 'attendance': attendance}

@frappe.whitelist()
def submit_expense_claim(expenses, project=None, remark=None):
    import json
    if isinstance(expenses, str):
        expenses = json.loads(expenses)
        
    employee = get_current_employee()
    company = frappe.db.get_value('Employee', employee, 'company') or 'C and E Consultancy Private Limited'
    
    doc = frappe.new_doc('Expense Claim')
    doc.employee = employee
    doc.company = company
    doc.project = project
    doc.custom_non_project_remark = remark or ''
    doc.remark = remark or 'Claim submitted via C&E Hub PWA'
    
    for exp in expenses:
        doc.append('expenses', {
            'expense_type': exp.get('expense_type', 'Other Expenses'),
            'amount': float(exp.get('amount', 0)),
            'description': exp.get('description', ''),
            'custom_expense_remark': exp.get('description', '')
        })
        
    doc.insert(ignore_permissions=True)
    return doc.name

@frappe.whitelist()
def get_expense_history():
    employee = get_current_employee()
    return frappe.get_all('Expense Claim', 
        filters={'employee': employee}, 
        fields=['name', 'total_claimed_amount', 'status', 'posting_date', 'creation'], 
        order_by='creation desc',
        limit_page_length=30
    )

@frappe.whitelist()
def get_salary_slips():
    employee = get_current_employee()
    return frappe.get_all('Salary Slip', 
        filters={'employee': employee, 'docstatus': 1}, 
        fields=['name', 'posting_date', 'net_pay', 'status', 'start_date', 'end_date'], 
        order_by='start_date desc',
        limit_page_length=24
    )

@frappe.whitelist()
def get_salary_slip_detail(slip_name):
    doc = frappe.get_doc('Salary Slip', slip_name)
    current_emp = get_current_employee()
    
    if doc.employee != current_emp and 'HR Manager' not in frappe.get_roles() and 'System Manager' not in frappe.get_roles():
        frappe.throw('You are not authorized to view this salary slip.', frappe.PermissionError)
        
    res = doc.as_dict()
    # Populate extra bank details from employee if missing
    if not res.get('bank_account_no'):
        res['bank_account_no'] = frappe.db.get_value('Employee', doc.employee, 'bank_ac_no') or \
                                 frappe.db.get_value('Employee', doc.employee, 'bank_account_number')
    if not res.get('ifsc_code'):
        res['ifsc_code'] = frappe.db.get_value('Employee', doc.employee, 'ifsc_code')
        
    return res
