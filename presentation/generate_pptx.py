"""
CampusCare PowerPoint Presentation Generator
Generates the exact slide deck requested by the user:
  1. Problem Statement
  2. Problem Identification
  3. Proposed Solution
  4. Journey
  5. Architecture
  6. Technical Architecture
  7. Open Source Framework
  8. Third Party API Integrated
  9. Project Images

Requirements:
    pip install python-pptx

Usage:
    python generate_pptx.py
"""

import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def create_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)  # 16:9 Widescreen
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # Brand Colors
    NAVY_DARK = RGBColor(15, 23, 42)      # Slate 900
    NAVY_BLUE = RGBColor(30, 58, 138)     # Blue 900
    ROYAL_BLUE = RGBColor(37, 99, 235)    # Blue 600
    LIGHT_BG = RGBColor(248, 250, 252)    # Slate 50
    CARD_BG = RGBColor(255, 255, 255)     # White
    CARD_BORDER = RGBColor(226, 232, 240) # Slate 200
    TEXT_DARK = RGBColor(15, 23, 42)      # Slate 900
    TEXT_MUTED = RGBColor(100, 116, 139)  # Slate 500
    EMERALD = RGBColor(16, 185, 129)      # Emerald 500
    AMBER = RGBColor(245, 158, 11)        # Amber 500
    ROSE = RGBColor(244, 63, 94)          # Rose 500

    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    IMAGES_DIR = os.path.join(BASE_DIR, "frontend", "images")

    def add_background(slide, color=LIGHT_BG):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = color
        bg.line.fill.background()
        return bg

    def add_header(slide, title, category="CAMPUSCARE • KIET GROUP OF INSTITUTIONS"):
        cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.5), Inches(11.7), Inches(0.4))
        tf_cat = cat_box.text_frame
        tf_cat.word_wrap = True
        p_cat = tf_cat.paragraphs[0]
        p_cat.text = category.upper()
        p_cat.font.size = Pt(10)
        p_cat.font.bold = True
        p_cat.font.color.rgb = ROYAL_BLUE

        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.85), Inches(11.7), Inches(0.8))
        tf_title = title_box.text_frame
        tf_title.word_wrap = True
        p_title = tf_title.paragraphs[0]
        p_title.text = title
        p_title.font.size = Pt(26)
        p_title.font.bold = True
        p_title.font.color.rgb = NAVY_DARK

    def add_card(slide, left, top, width, height, title="", subtitle="", bg_color=CARD_BG, border_color=CARD_BORDER):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
        card.fill.solid()
        card.fill.fore_color.rgb = bg_color
        card.line.color.rgb = border_color
        card.line.width = Pt(1.5)

        if title or subtitle:
            tb = slide.shapes.add_textbox(left + Inches(0.2), top + Inches(0.2), width - Inches(0.4), Inches(0.8))
            tf = tb.text_frame
            tf.word_wrap = True
            if title:
                p1 = tf.paragraphs[0]
                p1.text = title
                p1.font.size = Pt(15)
                p1.font.bold = True
                p1.font.color.rgb = NAVY_DARK
            if subtitle:
                p2 = tf.add_paragraph()
                p2.text = subtitle
                p2.font.size = Pt(11)
                p2.font.color.rgb = TEXT_MUTED
        return card

    # =========================================================================
    # SLIDE 0: Title Slide
    # =========================================================================
    s0 = prs.slides.add_slide(blank_layout)
    add_background(s0, NAVY_DARK)

    banner = s0.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(0.3), prs.slide_height)
    banner.fill.solid()
    banner.fill.fore_color.rgb = ROYAL_BLUE
    banner.line.fill.background()

    badge = s0.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.2), Inches(1.5), Inches(3.4), Inches(0.4))
    badge.fill.solid()
    badge.fill.fore_color.rgb = RGBColor(30, 41, 59)
    badge.line.color.rgb = ROYAL_BLUE
    tf_b = badge.text_frame
    p_b = tf_b.paragraphs[0]
    p_b.text = "MAJOR PROJECT TECHNICAL PRESENTATION"
    p_b.font.size = Pt(9)
    p_b.font.bold = True
    p_b.font.color.rgb = RGBColor(147, 197, 253)
    p_b.alignment = PP_ALIGN.CENTER

    t_box = s0.shapes.add_textbox(Inches(1.2), Inches(2.1), Inches(10.5), Inches(2.2))
    tf = t_box.text_frame
    tf.word_wrap = True
    p1 = tf.paragraphs[0]
    p1.text = "CampusCare"
    p1.font.size = Pt(54)
    p1.font.bold = True
    p1.font.color.rgb = RGBColor(255, 255, 255)

    p2 = tf.add_paragraph()
    p2.text = "College Civic Grievance & Issue Resolution System"
    p2.font.size = Pt(22)
    p2.font.color.rgb = RGBColor(203, 213, 225)

    desc_box = s0.shapes.add_textbox(Inches(1.2), Inches(4.5), Inches(10.5), Inches(1.2))
    tf_d = desc_box.text_frame
    tf_d.word_wrap = True
    pd1 = tf_d.paragraphs[0]
    pd1.text = "An Enterprise-grade Platform powered by Flask 3.0, Gemini AI Vision, Leaflet 2D Mapping & Multi-Engine DB"
    pd1.font.size = Pt(14)
    pd1.font.color.rgb = RGBColor(148, 163, 184)

    pd2 = tf_d.add_paragraph()
    pd2.text = "\nInstitution: KIET Group of Institutions, Ghaziabad  |  Domain: @kiet.edu  |  Academic Year: 2026-27"
    pd2.font.size = Pt(12)
    pd2.font.bold = True
    pd2.font.color.rgb = ROYAL_BLUE

    # =========================================================================
    # SLIDE 1: Problem Statement
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)
    add_background(s1)
    add_header(s1, "Problem Statement: Challenges in Campus Governance", "SLIDE 01 • OVERVIEW")

    c1 = add_card(s1, Inches(0.8), Inches(2.0), Inches(5.7), Inches(4.5), "High-Density Campus Breakdown Load")
    tb1 = s1.shapes.add_textbox(Inches(1.0), Inches(2.8), Inches(5.3), Inches(3.4))
    tf1 = tb1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    p.text = (
        "Higher education residential campuses like KIET span 30+ acres with multi-storey academic blocks, "
        "specialized computer labs, research centers, hostels, and dining halls.\n\n"
        "Civic and infrastructure breakdowns (water cooler leaks, electrical switch hazards, broken classroom furniture, "
        "sanitation issues, and Wi-Fi outages) occur on a continuous daily basis, creating a heavy maintenance load."
    )
    p.font.size = Pt(13)
    p.font.color.rgb = TEXT_DARK

    c2 = add_card(s1, Inches(6.8), Inches(2.0), Inches(5.7), Inches(4.5), "Failure of Legacy Manual Channels")
    tb2 = s1.shapes.add_textbox(Inches(7.0), Inches(2.8), Inches(5.3), Inches(3.4))
    tf2 = tb2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    p.text = (
        "Traditional grievance redressal relies heavily on physical paper registers kept in warden offices, "
        "verbal complaints, or unorganized student WhatsApp groups.\n\n"
        "These legacy methods suffer from:\n"
        "• Frequent loss of complaint records\n"
        "• Zero tracking for students regarding fix times\n"
        "• Complete lack of technician accountability\n"
        "• Average turnaround time exceeding 4 to 6 days"
    )
    p.font.size = Pt(13)
    p.font.color.rgb = TEXT_DARK

    # =========================================================================
    # SLIDE 2: Problem Identification
    # =========================================================================
    s2 = prs.slides.add_slide(blank_layout)
    add_background(s2)
    add_header(s2, "Problem Identification: 4 Structural Bottlenecks", "SLIDE 02 • ROOT CAUSES")

    p_data = [
        ("1. Missing Proof & Vague Reports", "Complaints lack photo/video evidence or exact room coordinates. Technicians waste hours walking through corridors trying to locate the exact breakdown.", ROSE),
        ("2. Zero Student Visibility", "Students have no tracking mechanism to know if anyone is assigned, estimated fix date, or why a complaint was rejected, causing severe dissatisfaction.", AMBER),
        ("3. Duplicate Report Flooding", "When central assets fail (e.g. corridor Wi-Fi or floor water coolers), dozens of students file identical tickets, creating massive administrative clutter.", NAVY_BLUE),
        ("4. No SLA Auditing & NAAC Metrics", "Management lacks quantitative resolution data, turnaround benchmarks, or technician efficiency reports needed for NAAC Criterion 5 and NIRF compliance.", ROYAL_BLUE)
    ]

    for i, (title, desc, color) in enumerate(p_data):
        col = i % 2
        row = i // 2
        left = Inches(0.8 + col * 5.9)
        top = Inches(2.0 + row * 2.4)
        add_card(s2, left, top, Inches(5.6), Inches(2.2), title)

        tag = s2.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top + Inches(0.15), Inches(0.1), Inches(0.4))
        tag.fill.solid()
        tag.fill.fore_color.rgb = color
        tag.line.fill.background()

        tb = s2.shapes.add_textbox(left + Inches(0.3), top + Inches(0.8), Inches(5.0), Inches(1.2))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = desc
        p.font.size = Pt(11.5)
        p.font.color.rgb = TEXT_DARK

    # =========================================================================
    # SLIDE 3: Proposed Solution
    # =========================================================================
    s3 = prs.slides.add_slide(blank_layout)
    add_background(s3)
    add_header(s3, "Proposed Solution: CampusCare Intelligent Ecosystem", "SLIDE 03 • INNOVATION")

    sol_cards = [
        ("AI Multimodal Intake", "Compulsory photo/video upload. Gemini AI vision inspects image bytes and automatically predicts domain, priority, and draft description.", ROYAL_BLUE),
        ("2D Leaflet Campus Map", "1.5 km campus geofenced interactive map pinning active and resolved complaints across all academic and hostel blocks.", EMERALD),
        ("Live 4-Step Stepper", "Amazon-style transparent tracking stepper (Pending -> In Progress -> Resolved -> Closed) with immutable audit timestamps.", AMBER),
        ("Community Upvoting", "Real-time duplicate detection interceptor allowing students to 1-click endorse active issues, boosting administrative priority.", NAVY_DARK)
    ]

    for i, (title, desc, color) in enumerate(sol_cards):
        left = Inches(0.8 + i * 2.95)
        top = Inches(2.0)
        add_card(s3, left, top, Inches(2.8), Inches(4.5), title)

        ic = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left + Inches(0.2), top + Inches(0.9), Inches(2.4), Inches(0.4))
        ic.fill.solid()
        ic.fill.fore_color.rgb = color
        ic.line.fill.background()
        p_ic = ic.text_frame.paragraphs[0]
        p_ic.text = f"FEATURE 0{i+1}"
        p_ic.font.size = Pt(9)
        p_ic.font.bold = True
        p_ic.font.color.rgb = RGBColor(255, 255, 255)
        p_ic.alignment = PP_ALIGN.CENTER

        tb = s3.shapes.add_textbox(left + Inches(0.2), top + Inches(1.5), Inches(2.4), Inches(2.7))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = desc
        p.font.size = Pt(12)
        p.font.color.rgb = TEXT_DARK

    # =========================================================================
    # SLIDE 4: Journey
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    add_background(s4)
    add_header(s4, "Journey: End-to-End Grievance Lifecycle", "SLIDE 04 • USER LIFECYCLE")

    journey_steps = [
        ("1. Snap & Scan", "Student snaps photo of broken facility. AI Vision parses visual cues and auto-selects category."),
        ("2. Duplicate Check", "System compares location & keyword vectors. Option to 1-Click Upvote if already reported."),
        ("3. Intake & Email", "Ticket logged to DB. Asynchronous multi-threaded HTML email alert sent to Admin & HOD."),
        ("4. Staff Delegation", "Admin assigns ticket to Department Maintenance In-Charge with target SLA deadline."),
        ("5. Resolve & Rate", "Technician resolves fault. Student inspects work, submits 1-5 star review, and closes ticket.")
    ]

    for i, (stitle, sdesc) in enumerate(journey_steps):
        left = Inches(0.8 + i * 2.36)
        top = Inches(2.1)
        add_card(s4, left, top, Inches(2.25), Inches(4.3), f"Step 0{i+1}")

        st_box = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left + Inches(0.15), top + Inches(0.7), Inches(1.95), Inches(0.4))
        st_box.fill.solid()
        st_box.fill.fore_color.rgb = ROYAL_BLUE
        st_box.line.fill.background()
        p_st = st_box.text_frame.paragraphs[0]
        p_st.text = stitle.split(". ")[1]
        p_st.font.size = Pt(10)
        p_st.font.bold = True
        p_st.font.color.rgb = RGBColor(255, 255, 255)
        p_st.alignment = PP_ALIGN.CENTER

        tb = s4.shapes.add_textbox(left + Inches(0.15), top + Inches(1.2), Inches(1.95), Inches(3.0))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = sdesc
        p.font.size = Pt(10.5)
        p.font.color.rgb = TEXT_DARK

    # =========================================================================
    # SLIDE 5: Architecture
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    add_background(s5)
    add_header(s5, "Architecture: 3-Tier Decoupled System Design", "SLIDE 05 • SYSTEM DESIGN")

    tiers = [
        ("Presentation Layer (Client)", [
            "HTML5, CSS3, ES6+ Vanilla JavaScript",
            "Tailwind CSS & Bootstrap 5.3+ Frameworks",
            "Leaflet.js 2D Campus Geolocation Mapping",
            "Chart.js Real-time KPI & SLA Analytics",
            "Portals: Student, Staff Desk, Admin Center"
        ]),
        ("Application Layer (Backend)", [
            "Python 3.10+ / Flask 3.0+ RESTful APIs",
            "PyJWT (HS256) 24h Stateless Tokens",
            "4 Blueprints: Auth, Complaints, Admin, Staff",
            "Google Gemini 1.5 Flash Multimodal Vision API",
            "Asynchronous Multi-threaded SMTP Mailer"
        ]),
        ("Database & Storage Layer", [
            "Universal DB Engine Adapter (backend/db.py)",
            "MySQL 8.0+ (PyMySQL / XAMPP Local)",
            "Microsoft SQL Server (pyodbc / ODBC 18)",
            "SQLite3 Fallback (WAL Concurrency Mode)",
            "UUID Hashed Multipart File Storage"
        ])
    ]

    for i, (title, items) in enumerate(tiers):
        left = Inches(0.8 + i * 3.95)
        top = Inches(2.0)
        add_card(s5, left, top, Inches(3.8), Inches(4.5), title)

        tb = s5.shapes.add_textbox(left + Inches(0.2), top + Inches(1.0), Inches(3.4), Inches(3.2))
        tf = tb.text_frame
        tf.word_wrap = True
        for j, item in enumerate(items):
            p = tf.paragraphs[0] if j == 0 else tf.add_paragraph()
            p.text = f"• {item}"
            p.font.size = Pt(11)
            p.font.color.rgb = TEXT_DARK

    # =========================================================================
    # SLIDE 6: Technical Architecture
    # =========================================================================
    s6 = prs.slides.add_slide(blank_layout)
    add_background(s6)
    add_header(s6, "Technical Architecture: Multi-Engine DB & Schema", "SLIDE 06 • TECHNICAL CORE")

    add_card(s6, Inches(0.8), Inches(2.0), Inches(5.7), Inches(4.5), "7 Normalized Relational Entities (3NF)")
    tb_t1 = s6.shapes.add_textbox(Inches(1.0), Inches(2.8), Inches(5.3), Inches(3.4))
    tf_t1 = tb_t1.text_frame
    tf_t1.word_wrap = True
    t_items = [
        "Users: Credentials, role ('Student'|'Admin'|'Staff'), department, course, phone.",
        "Categories: 12 Campus domains with target SLA hours (12h to 72h).",
        "Complaints: Core entity with GPS lat/lng, photo URL, priority, upvotes, status.",
        "ComplaintTimeline: Immutable audit trail of status transitions & notes.",
        "Feedback: 1:1 post-resolution review, 1 to 5 star rating, and student feedback.",
        "Notifications & Upvotes: Real-time alert triggers and community endorsements."
    ]
    for it in t_items:
        p = tf_t1.add_paragraph() if tf_t1.paragraphs[0].text else tf_t1.paragraphs[0]
        p.text = f"✔ {it}"
        p.font.size = Pt(10.5)
        p.font.color.rgb = TEXT_DARK

    add_card(s6, Inches(6.8), Inches(2.0), Inches(5.7), Inches(4.5), "Universal DB Adapter (backend/db.py)")
    tb_t2 = s6.shapes.add_textbox(Inches(7.0), Inches(2.8), Inches(5.3), Inches(3.4))
    tf_t2 = tb_t2.text_frame
    tf_t2.word_wrap = True
    u_items = [
        "Dynamic SQL Translation: Seamlessly rewrites SQL queries between MySQL, MSSQL, and SQLite at runtime.",
        "ACID Atomic Transactions: execute_transaction() guarantees status and timeline logs commit together.",
        "Composite Performance Indexes: Non-clustered indexes on (Status, CategoryID, Priority, CreatedAt).",
        "Referential Cascades: ON DELETE CASCADE on Complaints eliminates orphaned data."
    ]
    for it in u_items:
        p = tf_t2.add_paragraph() if tf_t2.paragraphs[0].text else tf_t2.paragraphs[0]
        p.text = f"⚡ {it}"
        p.font.size = Pt(10.5)
        p.font.color.rgb = TEXT_DARK

    # =========================================================================
    # SLIDE 7: Open Source Framework
    # =========================================================================
    s7 = prs.slides.add_slide(blank_layout)
    add_background(s7)
    add_header(s7, "Open Source Frameworks & Libraries", "SLIDE 07 • TECH STACK")

    add_card(s7, Inches(0.8), Inches(2.0), Inches(5.7), Inches(4.5), "Frontend Open Source Stack")
    tb_os1 = s7.shapes.add_textbox(Inches(1.0), Inches(2.8), Inches(5.3), Inches(3.4))
    tf_os1 = tb_os1.text_frame
    tf_os1.word_wrap = True
    os1_items = [
        "Tailwind CSS v3.4: Utility-first CSS framework for responsive design, badges, and glassmorphism.",
        "Bootstrap 5.3+: Responsive grid system, modals, and accessible dropdown components.",
        "Leaflet.js v1.9.4: Open-source interactive 2D geospatial mapping for campus navigation.",
        "Chart.js: HTML5 canvas data visualization for KPI cards and SLA compliance graphs.",
        "Lucide Icons: Modern lightweight vector icons for UI aesthetics."
    ]
    for it in os1_items:
        p = tf_os1.add_paragraph() if tf_os1.paragraphs[0].text else tf_os1.paragraphs[0]
        p.text = f"• {it}"
        p.font.size = Pt(10.5)
        p.font.color.rgb = TEXT_DARK

    add_card(s7, Inches(6.8), Inches(2.0), Inches(5.7), Inches(4.5), "Backend Open Source Stack")
    tb_os2 = s7.shapes.add_textbox(Inches(7.0), Inches(2.8), Inches(5.3), Inches(3.4))
    tf_os2 = tb_os2.text_frame
    tf_os2.word_wrap = True
    os2_items = [
        "Flask 3.0+: Lightweight WSGI micro-framework supporting modular Blueprints.",
        "PyJWT v2.8+: RFC 7519 JSON Web Tokens for stateless token-based authentication.",
        "Werkzeug Security v3.0+: Memory-hard Scrypt password hashing and multipart file parser.",
        "Flask-CORS v4.0+: Secure Cross-Origin Resource Sharing middleware.",
        "PyMySQL & pyodbc: Native connectors for MySQL 8.0 and SQL Server.",
        "Gunicorn: High-concurrency production WSGI HTTP server."
    ]
    for it in os2_items:
        p = tf_os2.add_paragraph() if tf_os2.paragraphs[0].text else tf_os2.paragraphs[0]
        p.text = f"• {it}"
        p.font.size = Pt(10.5)
        p.font.color.rgb = TEXT_DARK

    # =========================================================================
    # SLIDE 8: Third Party API Integrated
    # =========================================================================
    s8 = prs.slides.add_slide(blank_layout)
    add_background(s8)
    add_header(s8, "Third-Party API Integrations", "SLIDE 08 • INTEGRATIONS")

    apis = [
        ("Google Gemini 1.5 Flash Vision API", "Accepts image/video frames and uses multimodal intelligence to classify issues into 1 of 12 categories with priority and structured draft descriptions.", ROYAL_BLUE),
        ("OpenStreetMap (OSM) Tiles API", "Powers Leaflet map rendering with high-resolution street and satellite raster tiles covering the KIET campus boundary coordinates.", EMERALD),
        ("Google SMTP Mail Service API", "Dispatches multi-threaded, asynchronous HTML formatted email alerts with priority color badges to administrators via TLS Port 587.", AMBER),
        ("W3C HTML5 Geolocation API", "Captures device latitude and longitude from student smartphones and verifies within the campus 1.5 km geofence radius.", NAVY_DARK)
    ]

    for i, (title, desc, color) in enumerate(apis):
        left = Inches(0.8 + i * 2.95)
        top = Inches(2.0)
        add_card(s8, left, top, Inches(2.8), Inches(4.5), title)

        tag = s8.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top + Inches(0.15), Inches(0.1), Inches(0.4))
        tag.fill.solid()
        tag.fill.fore_color.rgb = color
        tag.line.fill.background()

        tb = s8.shapes.add_textbox(left + Inches(0.2), top + Inches(1.2), Inches(2.4), Inches(3.0))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = desc
        p.font.size = Pt(11)
        p.font.color.rgb = TEXT_DARK

    # =========================================================================
    # SLIDE 9: Project Images
    # =========================================================================
    s9 = prs.slides.add_slide(blank_layout)
    add_background(s9)
    add_header(s9, "Project Images: Live User Interface Showcase", "SLIDE 09 • INTERFACE")

    img_specs = [
        ("capture.png", "1. Camera Evidence Intake", "Drag-and-drop or live smartphone camera intake."),
        ("ai-analysis.png", "2. Gemini AI Analysis", "Multimodal prediction of category & priority."),
        ("gps.png", "3. 2D Leaflet Campus Map", "GPS status pins across university blocks."),
        ("track.jpg", "4. Live Tracking Stepper", "4-step progress stepper with technician logs.")
    ]

    for i, (img_name, ititle, idesc) in enumerate(img_specs):
        left = Inches(0.8 + i * 2.95)
        top = Inches(2.0)
        add_card(s9, left, top, Inches(2.8), Inches(4.5))

        img_path = os.path.join(IMAGES_DIR, img_name)
        if os.path.exists(img_path):
            try:
                s9.shapes.add_picture(img_path, left + Inches(0.15), top + Inches(0.2), width=Inches(2.5), height=Inches(2.4))
            except Exception as e:
                print(f"[-] Could not embed image {img_name}: {e}")

        tb = s9.shapes.add_textbox(left + Inches(0.15), top + Inches(2.8), Inches(2.5), Inches(1.5))
        tf = tb.text_frame
        tf.word_wrap = True
        p1 = tf.paragraphs[0]
        p1.text = ititle
        p1.font.size = Pt(12)
        p1.font.bold = True
        p1.font.color.rgb = NAVY_DARK

        p2 = tf.add_paragraph()
        p2.text = f"\n{idesc}"
        p2.font.size = Pt(10)
        p2.font.color.rgb = TEXT_MUTED

    output_path = os.path.join(os.path.dirname(__file__), "CampusCare_Presentation.pptx")
    prs.save(output_path)
    print(f"[+] Presentation saved successfully: {output_path}")

if __name__ == "__main__":
    create_deck()
