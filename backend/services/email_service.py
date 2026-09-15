"""
CampusCare Email Notification Service
Handles asynchronous dispatch of HTML formatted email alerts to administrators
when new grievances are submitted by students.
"""
import smtplib
import threading
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone
from backend.config import Config

logger = logging.getLogger('campuscare.email')

def _build_html_email(complaint, student, category):
    priority = complaint.get('Priority', 'Medium')
    
    priority_colors = {
        'Emergency': '#b91c1c',
        'High': '#dc2626',
        'Medium': '#d97706',
        'Low': '#475569'
    }
    badge_color = priority_colors.get(priority, '#2563eb')
    
    complaint_id = complaint.get('ComplaintID', '-')
    title = complaint.get('Title', 'No Title')
    description = complaint.get('Description', 'No description provided')
    location = complaint.get('Location', 'Unspecified Location')
    created_at = datetime.now(timezone.utc).strftime('%d %b %Y, %I:%M %p UTC')
    
    cat_name = category.get('CategoryName', 'Campus Service') if category else 'Campus Service'
    sla_hours = category.get('SLA_Hours', 48) if category else 48
    
    student_name = student.get('FullName', 'Student') if student else 'Student'
    student_email = student.get('CollegeEmail', 'Unknown') if student else 'Unknown'
    student_dept = student.get('Department', '-') if student else '-'
    student_course = student.get('Course', '-') if student else '-'
    student_phone = student.get('Phone', 'N/A') if student else 'N/A'

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #0f172a; }}
    .email-container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px rgba(0,0,0,0.06); }}
    .header {{ background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 28px 32px; color: #ffffff; text-align: left; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }}
    .header p {{ margin: 6px 0 0; font-size: 13px; color: #bfdbfe; font-weight: 500; }}
    .content {{ padding: 32px; }}
    .priority-badge {{ display: inline-block; background-color: {badge_color}; color: #ffffff; font-size: 12px; font-weight: 800; padding: 5px 14px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; }}
    .ticket-id {{ font-size: 14px; font-weight: 800; color: #2563eb; background: #eff6ff; padding: 4px 10px; border-radius: 6px; border: 1px solid #dbeafe; float: right; }}
    .grievance-title {{ font-size: 20px; font-weight: 800; color: #0f172a; margin: 16px 0 16px; line-height: 1.3; }}
    .info-table {{ width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }}
    .info-table td {{ padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #e2e8f0; }}
    .info-table tr:last-child td {{ border-bottom: none; }}
    .info-label {{ font-weight: 700; color: #64748b; width: 35%; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }}
    .info-val {{ font-weight: 600; color: #0f172a; }}
    .desc-box {{ background: #f8fafc; border-left: 4px solid #2563eb; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px; font-size: 14px; line-height: 1.6; color: #334155; }}
    .btn-wrapper {{ text-align: center; margin: 30px 0 10px; }}
    .action-btn {{ display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff !important; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 28px; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35); }}
    .footer {{ background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.6; }}
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>CampusCare Administrative Alert</h1>
      <p>Official KIET Civic Grievance & Issue Resolution System</p>
    </div>
    <div class="content">
      <div>
        <span class="priority-badge">{priority} Priority</span>
        <span class="ticket-id">Ticket #{complaint_id}</span>
        <div style="clear: both;"></div>
      </div>
      
      <h2 class="grievance-title">{title}</h2>
      
      <div class="desc-box">
        <strong>Grievance Description:</strong><br>
        {description}
      </div>

      <table class="info-table">
        <tr>
          <td class="info-label">Category</td>
          <td class="info-val">{cat_name}</td>
        </tr>
        <tr>
          <td class="info-label">Target SLA</td>
          <td class="info-val">{sla_hours} Hours</td>
        </tr>
        <tr>
          <td class="info-label">Campus Location</td>
          <td class="info-val">{location}</td>
        </tr>
        <tr>
          <td class="info-label">Reported By</td>
          <td class="info-val">{student_name} ({student_email})</td>
        </tr>
        <tr>
          <td class="info-label">Program & Branch</td>
          <td class="info-val">{student_course} &bull; {student_dept}</td>
        </tr>
        <tr>
          <td class="info-label">Contact Phone</td>
          <td class="info-val">{student_phone}</td>
        </tr>
        <tr>
          <td class="info-label">Reported At</td>
          <td class="info-val">{created_at}</td>
        </tr>
      </table>

      <div class="btn-wrapper">
        <a href="http://127.0.0.1:{Config.PORT}/admin.html" class="action-btn">
          Open Admin Control Center &rarr;
        </a>
      </div>
    </div>
    <div class="footer">
      This is an automated administrative notification dispatched by KIET CampusCare.<br>
      Ghaziabad-Meerut Road, Ghaziabad &bull; Helpline: +91-7949335337
    </div>
  </div>
</body>
</html>"""
    return html

def _build_text_email(complaint, student, category):
    complaint_id = complaint.get('ComplaintID', '-')
    title = complaint.get('Title', 'No Title')
    priority = complaint.get('Priority', 'Medium')
    description = complaint.get('Description', 'No description provided')
    location = complaint.get('Location', 'Unspecified Location')
    cat_name = category.get('CategoryName', 'Campus Service') if category else 'Campus Service'
    sla_hours = category.get('SLA_Hours', 48) if category else 48
    student_name = student.get('FullName', 'Student') if student else 'Student'
    student_email = student.get('CollegeEmail', 'Unknown') if student else 'Unknown'

    return f"""======================================================
CAMPUSCARE - NEW STUDENT GRIEVANCE REPORTED
======================================================
Ticket ID: #{complaint_id}
Priority: {priority}
Category: {cat_name} (SLA: {sla_hours} Hours)
Title: {title}
Location: {location}
Reported By: {student_name} ({student_email})

Description:
{description}

View & Update Status at: http://127.0.0.1:{Config.PORT}/admin.html
======================================================"""

def _send_email_worker(recipient, subject, html_content, text_content):
    smtp_user = Config.MAIL_USERNAME
    smtp_pass = Config.MAIL_PASSWORD
    smtp_server = Config.MAIL_SERVER
    smtp_port = Config.MAIL_PORT
    sender = Config.MAIL_DEFAULT_SENDER

    if not smtp_user or not smtp_pass:
        print("\n" + "="*70)
        print("[CAMPUSCARE EMAIL NOTIFICATION - SIMULATED / LOGGED]")
        print(f"To: {recipient}")
        print(f"From: {sender}")
        print(f"Subject: {subject}")
        print("-"*70)
        print(text_content.strip())
        print("="*70 + "\n")
        return

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = sender
        msg['To'] = recipient

        part1 = MIMEText(text_content, 'plain')
        part2 = MIMEText(html_content, 'html')

        msg.attach(part1)
        msg.attach(part2)

        with smtplib.SMTP(smtp_server, smtp_port, timeout=10) as server:
            if Config.MAIL_USE_TLS:
                server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(sender, [recipient], msg.as_string())
            print(f"[+] [EMAIL NOTIFICATION DISPATCHED] Successfully sent email to {recipient}")
    except Exception as e:
        print(f"[-] [EMAIL DISPATCH WARNING] Could not send email via SMTP ({e}). Fallback logged to console.")
        print(f"To: {recipient} | Subject: {subject}")

def dispatch_complaint_email(complaint, student, category):
    recipient = Config.ADMIN_NOTIFICATION_EMAIL
    priority = complaint.get('Priority', 'Medium')
    complaint_id = complaint.get('ComplaintID', 'New')
    title = complaint.get('Title', 'Grievance')

    subject = f"[CampusCare Alert] New {priority} Grievance #{complaint_id}: {title}"
    html_content = _build_html_email(complaint, student, category)
    text_content = _build_text_email(complaint, student, category)

    thread = threading.Thread(
        target=_send_email_worker,
        args=(recipient, subject, html_content, text_content),
        daemon=True
    )
    thread.start()
