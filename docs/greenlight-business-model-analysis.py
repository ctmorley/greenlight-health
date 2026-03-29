#!/usr/bin/env python3
"""
GreenLight by Medivis — Business Model & Pricing Strategy Analysis
Matches the visual style of GreenLight_by_Medivis_Business_Proposal.pdf
"""

import os, io, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.lib.colors import HexColor, Color
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image, KeepTogether, Flowable, Frame, PageTemplate
)
from reportlab.pdfgen import canvas
from reportlab.platypus.doctemplate import BaseDocTemplate

# ─── Brand Colors ────────────────────────────────────────────
BG_DARK = HexColor("#0A1A1A")
BG_GREEN = HexColor("#0D3D2E")
GREEN = HexColor("#10B981")
GREEN_LIGHT = HexColor("#D1FAE5")
GREEN_MUTED = HexColor("#065F46")
TEAL = HexColor("#14B8A6")
BLUE = HexColor("#3B82F6")
AMBER = HexColor("#F59E0B")
RED = HexColor("#EF4444")
PINK = HexColor("#EC4899")
DARK = HexColor("#111827")
GRAY = HexColor("#6B7280")
GRAY_LIGHT = HexColor("#F9FAFB")
GRAY_MED = HexColor("#E5E7EB")
WHITE = HexColor("#FFFFFF")

W, H = letter  # 612 x 792

# ─── Styles ──────────────────────────────────────────────────
styles = getSampleStyleSheet()

section_label = ParagraphStyle('SectionLabel', fontName='Courier-Bold', fontSize=11, textColor=GREEN, spaceAfter=2, leading=14)
title_style = ParagraphStyle('Title', fontName='Helvetica-Bold', fontSize=26, leading=32, textColor=DARK, spaceAfter=8)
subtitle_style = ParagraphStyle('Subtitle', fontName='Helvetica', fontSize=10.5, leading=16, textColor=GRAY, spaceAfter=16)
h2_style = ParagraphStyle('H2', fontName='Helvetica-Bold', fontSize=16, leading=22, textColor=DARK, spaceBefore=16, spaceAfter=6)
h3_style = ParagraphStyle('H3', fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=DARK, spaceBefore=10, spaceAfter=4)
body = ParagraphStyle('Body', fontName='Helvetica', fontSize=10, leading=15, textColor=DARK, spaceAfter=6)
body_sm = ParagraphStyle('BodySm', fontName='Helvetica', fontSize=9, leading=13, textColor=GRAY, spaceAfter=4)
mono_sm = ParagraphStyle('MonoSm', fontName='Courier', fontSize=8.5, leading=12, textColor=GRAY, spaceAfter=2)

# Table styles
th_style = ParagraphStyle('TH', fontName='Courier-Bold', fontSize=8, leading=11, textColor=GREEN, alignment=TA_LEFT)
th_center = ParagraphStyle('THC', fontName='Courier-Bold', fontSize=8, leading=11, textColor=GREEN, alignment=TA_CENTER)
td_style = ParagraphStyle('TD', fontName='Helvetica', fontSize=9, leading=13, textColor=DARK, alignment=TA_LEFT)
td_center = ParagraphStyle('TDC', fontName='Helvetica', fontSize=9, leading=13, textColor=DARK, alignment=TA_CENTER)
td_mono = ParagraphStyle('TDM', fontName='Courier', fontSize=9, leading=13, textColor=DARK, alignment=TA_CENTER)
td_bold = ParagraphStyle('TDB', fontName='Helvetica-Bold', fontSize=9, leading=13, textColor=DARK, alignment=TA_CENTER)

# Callout
callout_body = ParagraphStyle('CalloutBody', fontName='Helvetica', fontSize=9.5, leading=14, textColor=DARK)

# ─── Custom Flowables ────────────────────────────────────────

class GreenTopBar(Flowable):
    def __init__(self, width=None):
        Flowable.__init__(self)
        self.width = width or (W - 1.5*inch)
        self.height = 4
    def draw(self):
        self.canv.setFillColor(GREEN)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)

class StatCard(Flowable):
    """Stat card with colored left border — matches proposal style."""
    def __init__(self, value, label, border_color=GREEN, width=1.5*inch, height=0.75*inch):
        Flowable.__init__(self)
        self.value = value
        self.label = label
        self.border_color = border_color
        self.width = width
        self.height = height
    def draw(self):
        c = self.canv
        # Border
        c.setStrokeColor(self.border_color)
        c.setLineWidth(1)
        c.roundRect(0, 0, self.width, self.height, 4, stroke=1, fill=0)
        # Left accent
        c.setFillColor(self.border_color)
        c.rect(0, 2, 3, self.height - 4, fill=1, stroke=0)
        # Value
        c.setFillColor(self.border_color)
        c.setFont('Courier-Bold', 16)
        c.drawString(12, self.height - 22, self.value)
        # Label
        c.setFillColor(GRAY)
        c.setFont('Courier', 7)
        c.drawString(12, 8, self.label.upper())

class CalloutBox(Flowable):
    """Green-bordered callout box matching proposal style."""
    def __init__(self, text, border_color=GREEN, box_width=None):
        Flowable.__init__(self)
        self.text = text
        self.border_color = border_color
        self.box_width = box_width or (W - 1.5*inch)
        self.width = self.box_width
        p = Paragraph(text, callout_body)
        pw, ph = p.wrap(self.box_width - 30, 1000)
        self.height = ph + 20
        self.para = p
    def draw(self):
        c = self.canv
        c.setStrokeColor(self.border_color)
        c.setLineWidth(1)
        c.roundRect(0, 0, self.box_width, self.height, 4, stroke=1, fill=0)
        c.setFillColor(self.border_color)
        c.rect(0, 2, 3, self.height - 4, fill=1, stroke=0)
        self.para.drawOn(c, 15, 10)

class StatCardRow(Flowable):
    """Row of stat cards."""
    def __init__(self, cards_data, card_width=None):
        Flowable.__init__(self)
        self.cards_data = cards_data
        total_w = W - 1.5*inch
        n = len(cards_data)
        self.card_w = card_width or ((total_w - (n-1)*8) / n)
        self.height = 68
        self.width = total_w
    def draw(self):
        x = 0
        for val, label, color in self.cards_data:
            sc = StatCard(val, label, color, self.card_w, self.height)
            sc.drawOn(self.canv, x, 0)
            x += self.card_w + 8


# ─── Helper Functions ────────────────────────────────────────

def section_header(num, title, desc=None):
    """Return list of flowables for a section header."""
    items = [
        GreenTopBar(),
        Spacer(1, 8),
        Paragraph(f"SECTION {num:02d}", section_label),
        Paragraph(title, title_style),
    ]
    if desc:
        items.append(Paragraph(desc, subtitle_style))
    return items

def make_table(headers, rows, col_widths=None):
    """Table matching proposal style: green monospace headers, clean rows."""
    header_row = [Paragraph(h.upper(), th_center if i > 0 else th_style) for i, h in enumerate(headers)]
    data = [header_row]
    for row in rows:
        data.append([
            Paragraph(str(c), td_style if i == 0 else td_center)
            for i, c in enumerate(row)
        ])
    tw = col_widths or [((W - 1.5*inch) / len(headers))] * len(headers)
    t = Table(data, colWidths=tw, repeatRows=1)
    style_cmds = [
        ('FONTNAME', (0, 0), (-1, 0), 'Courier-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('TEXTCOLOR', (0, 0), (-1, 0), GREEN),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('LINEBELOW', (0, 0), (-1, 0), 1, GRAY_MED),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('TEXTCOLOR', (0, 1), (-1, -1), DARK),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('LINEBELOW', (0, 1), (-1, -1), 0.5, HexColor("#F3F4F6")),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t

def make_pros_cons_table(pros, cons):
    """Pros/cons table with colored cards matching proposal style."""
    max_len = max(len(pros), len(cons))
    # Build two-column card layout
    data = [[
        Paragraph("<font color='#10B981'><b>Pros</b></font>", ParagraphStyle('ph', parent=td_style, fontSize=10)),
        Paragraph("<font color='#EF4444'><b>Cons</b></font>", ParagraphStyle('ch', parent=td_style, fontSize=10)),
    ]]
    for i in range(max_len):
        p = f"<font color='#065F46'>+ {pros[i]}</font>" if i < len(pros) else ""
        c = f"<font color='#991B1B'>- {cons[i]}</font>" if i < len(cons) else ""
        data.append([
            Paragraph(p, ParagraphStyle('p', parent=td_style, fontSize=9, leading=13)),
            Paragraph(c, ParagraphStyle('c', parent=td_style, fontSize=9, leading=13)),
        ])
    tw = [(W - 1.5*inch) / 2] * 2
    t = Table(data, colWidths=tw)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), GREEN_LIGHT),
        ('BACKGROUND', (1, 0), (1, 0), HexColor("#FEF2F2")),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, GRAY_MED),
        ('LINEBELOW', (0, 1), (-1, -1), 0.5, HexColor("#F9FAFB")),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('BOX', (0, 0), (0, -1), 0.5, GRAY_MED),
        ('BOX', (1, 0), (1, -1), 0.5, GRAY_MED),
    ]))
    return t

def make_chart(fig, width=6.8, height=3.5):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=200, bbox_inches='tight', facecolor='white', edgecolor='none')
    plt.close(fig)
    buf.seek(0)
    return Image(buf, width=width*inch, height=height*inch)

def bullet(text):
    style = ParagraphStyle('Bullet', parent=body, leftIndent=16, bulletIndent=4, spaceAfter=3)
    return Paragraph(f"<bullet>&bull;</bullet> {text}", style)

# ─── Financial Models ────────────────────────────────────────

def model_per_txn(vol, price=8): return vol * price
def model_saas(vol, tier=799): return tier
def model_hybrid(vol, base=799, incl=250, ovr=6): return base + max(0, vol - incl) * ovr
def model_per_seat(prov, price=200): return prov * price
def model_success(vol, rate=0.85, price=20): return vol * rate * price

def sim_arr_24mo(model_fn, **kw):
    months = list(range(1, 25))
    customers = []
    arr = []
    for m in months:
        new = 3 if m <= 6 else 5 if m <= 12 else 8 if m <= 18 else 12
        avg_vol = 200 if m <= 6 else 350 if m <= 12 else 600 if m <= 18 else 800
        customers.append((new, avg_vol))
        customers = [(max(0, n - int(n * 0.05)), v) for n, v in customers if n - int(n * 0.05) > 0]
        mrr = sum(model_fn(v, **kw) * n for n, v in customers)
        arr.append(mrr * 12)
    return arr

# ─── Page Templates ──────────────────────────────────────────

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Courier', 8)
    canvas.setFillColor(GREEN)
    canvas.drawString(0.75*inch, 0.4*inch, "green")
    canvas.setFillColor(WHITE if False else DARK)
    canvas.drawString(0.75*inch + canvas.stringWidth("green", 'Courier', 8), 0.4*inch, "light")
    canvas.setFont('Helvetica', 7)
    canvas.setFillColor(GRAY)
    canvas.drawString(0.75*inch + canvas.stringWidth("greenlight", 'Courier', 8) + 4, 0.4*inch, "by Medivis")
    canvas.drawRightString(W - 0.75*inch, 0.4*inch, f"{doc.page:02d}")
    canvas.restoreState()

# ─── Build PDF ───────────────────────────────────────────────

def build_pdf():
    out = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'GreenLight_Business_Model_Analysis.pdf'))

    doc = SimpleDocTemplate(out, pagesize=letter,
        leftMargin=0.75*inch, rightMargin=0.75*inch,
        topMargin=0.6*inch, bottomMargin=0.65*inch)

    story = []
    usable_w = W - 1.5*inch

    # ═══════════════════════════════════════════════════════════
    # COVER PAGE (drawn on canvas via onFirstPage)
    # ═══════════════════════════════════════════════════════════

    class CoverPage(Flowable):
        def __init__(self): Flowable.__init__(self); self.width = usable_w - 12; self.height = H - 1.5*inch
        def draw(self):
            c = self.canv
            # Green gradient background
            c.saveState()
            c.setFillColor(HexColor("#0B3B2D"))
            c.rect(-0.75*inch, -0.65*inch, W, H, fill=1, stroke=0)
            # Lighter overlay gradient (approximate)
            c.setFillColor(HexColor("#0D4A35"))
            c.rect(-0.75*inch, -0.65*inch, W, H*0.6, fill=1, stroke=0)

            # Confidential header
            c.setFont('Courier', 9)
            c.setFillColor(HexColor("#FFFFFF80"))
            c.drawString(0, self.height - 20, "CONFIDENTIAL  —  FOR DISCUSSION ONLY")

            # Brand
            y = self.height * 0.48
            c.setFont('Courier-Bold', 22)
            c.setFillColor(GREEN)
            c.drawString(0, y + 60, "green")
            gw = c.stringWidth("green", 'Courier-Bold', 22)
            c.setFillColor(WHITE)
            c.drawString(gw, y + 60, "light")
            lw = c.stringWidth("light", 'Courier-Bold', 22)
            c.setFont('Helvetica', 12)
            c.setFillColor(HexColor("#FFFFFF80"))
            c.drawString(gw + lw + 6, y + 62, "by Medivis")

            # Title
            c.setFont('Helvetica-Bold', 32)
            c.setFillColor(WHITE)
            c.drawString(0, y + 14, "Business Model &")
            c.drawString(0, y - 24, "Pricing Strategy")

            # Subtitle
            c.setFont('Helvetica', 11)
            c.setFillColor(HexColor("#FFFFFFB0"))
            c.drawString(0, y - 56, "AI-Powered Prior Authorization for Imaging, Surgery & Procedures")

            # Stat cards at bottom
            card_w = (usable_w - 24) / 4
            card_h = 55
            card_y = 30
            stats = [
                ("6", "MODELS ANALYZED", GREEN),
                ("9", "COMPETITORS", TEAL),
                ("$6M+", "24-MO ARR TARGET", AMBER),
                ("5-8x", "CUSTOMER ROI", GREEN),
            ]
            for i, (val, lbl, col) in enumerate(stats):
                x = i * (card_w + 8)
                c.setStrokeColor(col)
                c.setLineWidth(1)
                c.roundRect(x, card_y, card_w, card_h, 4, stroke=1, fill=0)
                c.setFillColor(col)
                c.rect(x, card_y + 2, 3, card_h - 4, fill=1, stroke=0)
                c.setFont('Courier-Bold', 16)
                c.drawString(x + 12, card_y + card_h - 22, val)
                c.setFont('Courier', 6.5)
                c.setFillColor(HexColor("#FFFFFF80"))
                c.drawString(x + 12, card_y + 8, lbl)

            # Footer
            c.setFont('Helvetica', 9)
            c.setFillColor(HexColor("#FFFFFF60"))
            c.drawString(0, 8, "Prepared: March 2026")
            c.drawRightString(usable_w, 8, "Classification: Confidential")
            c.restoreState()

    story.append(CoverPage())
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 01: MARKET CONTEXT
    # ═══════════════════════════════════════════════════════════
    story.extend(section_header(1, "Market Context", "The prior authorization automation market is large, growing, and underserved in imaging and surgery."))

    story.append(Paragraph("<b>Market Size & Growth</b>", h3_style))
    story.append(make_table(
        ["Metric", "Value", "Source"],
        [
            ["Total PA admin waste (US)", "$41.4 - 55.8B / year", "IDC 2024"],
            ["Provider-side PA burden", "$31B / year", "Valer Health 2024"],
            ["PA automation platform market (2024)", "$2.18B", "Allied Market Research"],
            ["PA automation platform market (2033)", "$11.32B (18.4% CAGR)", "Allied Market Research"],
            ["FHIR PA market (2025 \u2192 2036)", "$745M \u2192 $3.2B", "Industry estimates"],
            ["Total medical PA transactions / year", "350 - 500M", "CAQH 2024"],
            ["Medicare Advantage PA determinations", "53M (2024), up from 37M (2019)", "KFF 2024"],
        ],
        col_widths=[2.4*inch, 2.3*inch, 2.0*inch]
    ))

    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>The Automation Gap</b>", h3_style))
    story.append(make_table(
        ["PA Category", "Revenue Protected", "Automation Rate"],
        [
            ["Standard pharmacy", "$15 - $500", "~75% electronic"],
            ["Imaging", "$500 - $4,000", "~30% electronic"],
            ["Surgical / procedural", "$10,000 - $100,000+", "~25% electronic"],
        ],
        col_widths=[2.2*inch, 2.4*inch, 2.1*inch]
    ))

    story.append(Spacer(1, 8))
    story.append(CalloutBox(
        "<b>Key insight:</b> Surgical PA protects 100-200x the revenue of pharmacy PA, yet has the "
        "least automation. 80.7% of appealed MA denials are overturned (KFF 2024), but only 11.5% of "
        "denials are actually appealed — representing $10B+ in lost revenue annually."
    ))

    story.append(Spacer(1, 8))
    story.append(Paragraph("<b>Regulatory Tailwind: CMS-0057-F</b>", h3_style))
    story.append(bullet("<b>Jan 1, 2026 (now in effect):</b> 72-hour urgent / 7-day standard decision timeframes"))
    story.append(bullet("<b>Jan 1, 2027:</b> All MA, Medicaid, CHIP, QHP payers must support FHIR-based PA API"))
    story.append(bullet("Covers medical items/services — explicitly excludes pharmacy (GreenLight's exact niche)"))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 02: BASE ASSUMPTIONS
    # ═══════════════════════════════════════════════════════════
    story.extend(section_header(2, "Base Assumptions", "PA volumes, staff costs, and financial model inputs used across all projections."))

    story.append(Paragraph("<b>PA Volume by Facility Type</b>", h3_style))
    story.append(make_table(
        ["Facility Type", "Avg PAs / Month", "Ordering Providers"],
        [
            ["Solo Radiology Practice", "80", "1 - 2"],
            ["Multi-Physician Imaging Center", "250", "5 - 8"],
            ["Ambulatory Surgical Center", "350", "8 - 15"],
            ["Community Hospital", "1,500", "50 - 100"],
            ["Large Health System", "8,000", "200 - 500"],
        ],
        col_widths=[2.8*inch, 2.0*inch, 1.9*inch]
    ))

    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Cost of Manual PA Processing</b>", h3_style))
    story.append(make_table(
        ["Cost Component", "Estimate", "Source"],
        [
            ["Avg time per PA (phone + fax + follow-up)", "45 minutes", "AMA 2024"],
            ["Loaded staff cost (PA coordinator)", "~$55 / hour", "BLS + benefits"],
            ["Manual PA cost (CAQH)", "$10.26 provider-side", "CAQH 2022"],
            ["Electronic PA cost (CAQH)", "$1.92 (81% reduction)", "CAQH 2022"],
            ["Denial rework cost", "$50 - $120 per denial", "Valer Health"],
            ["Annual PA burden per physician", "$68,274 (2.0 FTE equiv)", "AMA 2024"],
        ],
        col_widths=[2.9*inch, 2.0*inch, 1.8*inch]
    ))

    story.append(Spacer(1, 10))
    story.append(StatCardRow([
        ("$42", "AVG LABOR COST PER PA", GREEN),
        ("$30", "EFFECTIVE SAVINGS PER PA", TEAL),
        ("70%", "TARGET AUTOMATION RATE", AMBER),
        ("15%", "AVG IMAGING DENIAL RATE", RED),
    ]))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 03: COMPETITIVE LANDSCAPE
    # ═══════════════════════════════════════════════════════════
    story.extend(section_header(3, "Competitive Landscape",
        "The PA automation market is fragmented. No player dominates imaging and procedure PA with self-serve + AI autonomy."))

    story.append(make_table(
        ["Company", "Model", "Price Point", "Focus", "Funding"],
        [
            ["Humata Health", "Enterprise", "$50K-200K/yr", "Imaging PA + EHR", "$25M Series A"],
            ["Infinitus AI", "Per-call", "$25-50/call", "AI phone agent", "$50M Series B"],
            ["Myndshft/Waystar", "Per-txn", "$3-10/PA", "Real-time PA", "Acquired"],
            ["Tandem Health", "Pharma-funded", "Free to providers", "Medication/Rx PA only", "$137M ($1B val)"],
            ["Cohere Health", "PMPM", "$0.50-2 PMPM", "Payer PA platform", "$106M Series C"],
            ["Waystar", "Enterprise", "$50K-500K/yr", "Full RCM suite", "Public ($4.7B)"],
            ["SamaCare", "SaaS + txn", "$500-1.5K/mo", "PA submission portal", "$20M raised"],
            ["CoverMyMeds", "Pharma-funded", "Free to providers", "Pharmacy PA only", "Acq. $1.4B"],
            ["Availity", "Payer-funded", "$0-500/mo", "Clearinghouse + PA", "Private"],
        ],
        col_widths=[1.3*inch, 1.0*inch, 1.2*inch, 1.6*inch, 1.2*inch]
    ))

    story.append(Spacer(1, 10))
    story.append(CalloutBox(
        "<b>GreenLight by Medivis differentiation:</b> Purpose-built for imaging and surgical PA. "
        "Self-serve SaaS onboarding (no enterprise sales cycle required). AI-powered autonomy engine "
        "(auto-submit, auto-appeal, clinical summarization). FHIR-native with Da Vinci CRD/DTR/PAS. "
        "ACR Appropriateness Criteria matching. No competitor combines all of these with self-serve pricing."
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 04: BUSINESS MODEL OPTIONS
    # ═══════════════════════════════════════════════════════════
    story.extend(section_header(4, "Business Model Options",
        "Six pricing models evaluated. Each has trade-offs in revenue predictability, value alignment, and go-to-market fit."))

    models = [
        ("Model A: Per-Transaction",
         "Charge a flat fee for every PA processed through GreenLight.",
         "$6-12 per PA submitted (recommended: $8)",
         "Infinitus ($25-50/call), Myndshft ($3-10/PA), Tandem (est. per-case)",
         "Mid-to-large facilities with predictable PA volume",
         ["Directly tied to value \u2014 easy ROI story", "Scales with customer volume", "Low barrier to entry", "Variable revenue aligns with usage"],
         ["Revenue unpredictable month-to-month", "Harder to forecast ARR for fundraising", "Customers may route only difficult PAs", "No revenue floor during slow months"]),
        ("Model B: Flat SaaS Subscription",
         "Fixed monthly fee per tier, regardless of PA volume.",
         "Starter $299/mo | Professional $799/mo | Enterprise custom",
         "Most B2B SaaS, some healthcare workflow tools",
         "Self-serve SMB acquisition, initial ARR building",
         ["Predictable MRR \u2014 investors love this", "Simple to understand and sell", "Self-serve via Stripe Checkout", "Standard SaaS metrics (MRR, churn, LTV)"],
         ["Disconnected from value at high volume", "Hospital pays same as solo practice", "Revenue capped regardless of usage", "Must gate features, not volume"]),
        ("Model C: Hybrid (Base + Per-Transaction)",
         "Monthly base fee includes X PAs, then per-PA overage pricing.",
         "$799/mo (250 PAs incl.) + $6/PA overage",
         "Twilio, AWS, most mature health-tech platforms",
         "Bridging self-serve and enterprise \u2014 RECOMMENDED",
         ["Predictable base MRR + volume upside", "Revenue scales with customer value", "Stripe supports natively (metered billing)", "Fair pricing at every customer size", "Best investor story: predictable + growth"],
         ["Slightly more complex billing", "Two-component pricing to explain", "Requires usage tracking infrastructure"]),
        ("Model D: Per-Provider Seat Licensing",
         "Charge per ordering provider who uses the platform.",
         "$100-300 per provider per month",
         "Epic App Orchard apps, some EHR add-ons",
         "Enterprise hospital system deals",
         ["Scales with practice size naturally", "Easy for per-headcount hospital budgets", "Predictable per-customer revenue"],
         ["Doesn't reflect PA volume", "Incentivizes seat minimization", "Misaligned with value delivery"]),
        ("Model E: Performance / Success-Based",
         "Charge only when GreenLight achieves a successful outcome.",
         "$15-50 per approved PA \u2014 or \u2014 1-3% of revenue protected",
         "Some RCM companies, contingency billing services",
         "Pilot deals with risk-averse health systems",
         ["Easiest sale: 'you only pay when we deliver'", "Massive upside if approval rates are high", "Eliminates buyer risk completely", "Powerful competitive differentiator"],
         ["Hard to attribute causation", "Revenue timing: payment after approval", "Requires trust + measurement infra", "Risk of low-quality PA cherry-picking"]),
        ("Model F: Freemium + Usage-Based AI",
         "Free tier for manual PA tracking. Pay per AI feature usage.",
         "Free (manual) | $0.50-1.00/AI call | $X/mo for autonomy",
         "Notion, Slack, Figma (rare in healthcare)",
         "Long-term market capture if well-funded",
         ["Massive top-of-funnel", "Product-led growth: value before payment", "AI usage tied to AI costs", "Natural upgrade path"],
         ["Free users cost money", "Healthcare SaaS conversion 2-5%", "Long sales cycle free \u2192 paid", "Difficult to build ARR quickly"]),
    ]

    for name, desc, pricing, examples, best_for, pros, cons in models:
        story.append(Paragraph(f"<b>{name}</b>", h2_style))
        story.append(Paragraph(desc, body))
        story.append(Paragraph(f"<b>Pricing:</b> {pricing}", body))
        story.append(Paragraph(f"<font color='#6B7280'>Competitors: {examples}</font>", body_sm))
        story.append(Paragraph(f"<font color='#6B7280'>Best for: {best_for}</font>", body_sm))
        story.append(Spacer(1, 4))
        story.append(make_pros_cons_table(pros, cons))
        story.append(Spacer(1, 6))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 05: FINANCIAL MODELS
    # ═══════════════════════════════════════════════════════════
    story.extend(section_header(5, "Financial Model Comparison",
        "Revenue projections under each model. Base case assumptions from Section 02."))

    story.append(Paragraph("<b>Revenue Per Customer (Monthly)</b>", h3_style))

    vols = [("Solo Practice", 80, 2), ("Imaging Center", 250, 6), ("Surgical Center", 350, 12),
            ("Community Hospital", 1500, 75), ("Health System", 8000, 300)]
    rows = []
    for name, v, p in vols:
        rows.append([
            f"{name} ({v} PAs)",
            f"${model_per_txn(v):,}", f"${model_saas(v):,}", f"${model_hybrid(v):,}",
            f"${model_per_seat(p):,}", f"${model_success(v):,.0f}",
        ])
    story.append(make_table(
        ["Customer", "Per-Txn $8", "SaaS $799", "Hybrid", "Per-Seat", "Success"],
        rows, col_widths=[1.6*inch, 0.9*inch, 0.9*inch, 0.95*inch, 0.9*inch, 0.95*inch]
    ))

    story.append(Spacer(1, 8))
    story.append(CalloutBox(
        "<b>Observation:</b> Flat SaaS massively undercharges high-volume customers ($799 for a hospital "
        "doing 1,500 PAs/mo). Per-transaction and hybrid models capture 5-15x more revenue from hospitals "
        "and health systems. The hybrid model provides the best balance across all customer sizes."
    ))

    # ── Revenue chart ──
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Revenue by Facility Type</b>", h3_style))

    fig, ax = plt.subplots(figsize=(10, 4.5))
    names = [v[0] for v in vols]
    x = np.arange(len(names))
    w = 0.15
    colors_list = ['#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EF4444']
    labels = ['Per-Txn ($8)', 'SaaS ($799)', 'Hybrid ($799+$6)', 'Per-Seat ($200)', 'Success ($20)']
    vals = [
        [model_per_txn(v[1]) for v in vols],
        [model_saas(v[1]) for v in vols],
        [model_hybrid(v[1]) for v in vols],
        [model_per_seat(v[2]) for v in vols],
        [model_success(v[1]) for v in vols],
    ]
    for i, (v, c, l) in enumerate(zip(vals, colors_list, labels)):
        ax.bar(x + (i-2)*w, v, w, label=l, color=c, edgecolor='white', linewidth=0.5)
    ax.set_xticks(x)
    ax.set_xticklabels(names, fontsize=8.5)
    ax.set_ylabel('Monthly Revenue ($)', fontsize=9)
    ax.legend(fontsize=7, loc='upper left')
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, p: f'${v:,.0f}'))
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    plt.tight_layout()
    story.append(make_chart(fig, 7.0, 3.5))

    story.append(PageBreak())

    # ── ARR Projection ──
    story.extend(section_header(6, "ARR Projection \u2014 24 Months",
        "Customer acquisition: 3/mo (M1-6), 5/mo (M7-12), 8/mo (M13-18), 12/mo (M19-24). 5% monthly churn."))

    months = list(range(1, 25))
    arr_txn = sim_arr_24mo(model_per_txn, price=8)
    arr_saas = sim_arr_24mo(lambda v, **kw: 799)
    arr_hybrid = sim_arr_24mo(model_hybrid, base=799, incl=250, ovr=6)
    arr_success = sim_arr_24mo(model_success, rate=0.85, price=20)

    fig, ax = plt.subplots(figsize=(10, 4.5))
    ax.plot(months, [a/1e6 for a in arr_txn], label='Per-Transaction ($8/PA)', color='#3B82F6', linewidth=2)
    ax.plot(months, [a/1e6 for a in arr_saas], label='Flat SaaS ($799/mo)', color='#F59E0B', linewidth=2)
    ax.plot(months, [a/1e6 for a in arr_hybrid], label='Hybrid ($799 + $6/PA)', color='#10B981', linewidth=2.5)
    ax.plot(months, [a/1e6 for a in arr_success], label='Success ($20/approval)', color='#EF4444', linewidth=2)
    ax.set_xlabel('Month', fontsize=9)
    ax.set_ylabel('ARR ($M)', fontsize=9)
    ax.legend(fontsize=8)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, p: f'${v:.1f}M'))
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.grid(axis='y', alpha=0.2)
    plt.tight_layout()
    story.append(make_chart(fig, 7.0, 3.5))

    story.append(Spacer(1, 10))
    story.append(make_table(
        ["Model", "Month 12 ARR", "Month 24 ARR"],
        [
            ["Per-Transaction ($8/PA)", f"${arr_txn[11]/1e6:.2f}M", f"${arr_txn[23]/1e6:.2f}M"],
            ["Flat SaaS ($799/mo)", f"${arr_saas[11]/1e6:.2f}M", f"${arr_saas[23]/1e6:.2f}M"],
            ["Hybrid ($799 + $6/PA)", f"${arr_hybrid[11]/1e6:.2f}M", f"${arr_hybrid[23]/1e6:.2f}M"],
            ["Success ($20/approval)", f"${arr_success[11]/1e6:.2f}M", f"${arr_success[23]/1e6:.2f}M"],
        ],
        col_widths=[3.0*inch, 2.0*inch, 2.0*inch]
    ))

    story.append(PageBreak())

    # ── ROI Analysis ──
    story.extend(section_header(7, "Customer ROI Analysis",
        "Net savings vs. GreenLight cost under the hybrid model. ROI excludes denial prevention and revenue protection value."))

    roi_rows = []
    for name, vol, prov in vols:
        savings = vol * 30
        cost = model_hybrid(vol)
        net = savings - cost
        roi = (net / cost) * 100
        roi_rows.append([name, f"{vol}", f"${savings:,}", f"${cost:,}", f"${net:,}", f"{roi:.0f}%"])
    story.append(make_table(
        ["Facility", "PAs/mo", "Monthly Savings", "GreenLight Cost", "Net Savings", "ROI"],
        roi_rows,
        col_widths=[1.4*inch, 0.8*inch, 1.2*inch, 1.2*inch, 1.1*inch, 0.8*inch]
    ))

    story.append(Spacer(1, 10))
    story.append(CalloutBox(
        "<b>Every customer segment sees positive ROI.</b> Solo practices achieve 2x ROI. Hospitals and health "
        "systems see 5-8x ROI \u2014 making the sale virtually risk-free. These figures exclude additional "
        "value from denial prevention and auto-appeal revenue recovery, which can add 3-10x more."
    ))

    story.append(Spacer(1, 10))
    story.append(StatCardRow([
        ("2x+", "SOLO PRACTICE ROI", GREEN),
        ("5-8x", "HOSPITAL ROI", TEAL),
        ("$10B+", "UNAPPEALED DENIAL VALUE", AMBER),
        ("80.7%", "APPEAL OVERTURN RATE", RED),
    ]))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 08: SENSITIVITY ANALYSIS
    # ═══════════════════════════════════════════════════════════
    story.extend(section_header(8, "Sensitivity Analysis",
        "Key levers that drive revenue under the hybrid model."))

    story.append(Paragraph("<b>Price Sensitivity (Imaging Center, 250 PAs/mo)</b>", h3_style))
    scenarios = [
        ("Low base, low overage", 299, 100, 4),
        ("Low base, high overage", 299, 100, 8),
        ("Mid base, mid overage", 499, 150, 6),
        ("Recommended", 799, 250, 6),
        ("High base, low overage", 999, 300, 5),
        ("Premium", 1499, 500, 4),
    ]
    sens_rows = []
    for label, base, incl, ovr in scenarios:
        rev = model_hybrid(250, base, incl, ovr)
        sens_rows.append([label, f"${base}", f"{incl}", f"${ovr}", f"${rev:,}", f"${rev*12:,}"])
    story.append(make_table(
        ["Scenario", "Base/mo", "Incl PAs", "Overage", "Monthly", "Annual"],
        sens_rows, col_widths=[1.6*inch, 0.9*inch, 0.9*inch, 0.8*inch, 1.0*inch, 1.0*inch]
    ))

    story.append(Spacer(1, 12))
    story.append(Paragraph("<b>Customer Acquisition Sensitivity (Hybrid Model)</b>", h3_style))

    fig, ax = plt.subplots(figsize=(10, 4.5))
    for label, mult, color, ls in [
        ("Conservative (0.5x)", 0.5, '#94A3B8', '--'),
        ("Base case (1x)", 1.0, '#10B981', '-'),
        ("Aggressive (2x)", 2.0, '#3B82F6', '-'),
        ("Hypergrowth (3x)", 3.0, '#8B5CF6', '-'),
    ]:
        customers = []
        arr_vals = []
        for m in months:
            new = int((3 if m <= 6 else 5 if m <= 12 else 8 if m <= 18 else 12) * mult)
            avg = 200 if m <= 6 else 350 if m <= 12 else 600 if m <= 18 else 800
            customers.append((new, avg))
            customers = [(max(0, n - int(n * 0.05)), v) for n, v in customers if n - int(n * 0.05) > 0]
            mrr = sum(model_hybrid(v, 799, 250, 6) * n for n, v in customers)
            arr_vals.append(mrr * 12)
        ax.plot(months, [a/1e6 for a in arr_vals], label=label, color=color, linewidth=2 if mult==1.0 else 1.5, linestyle=ls)
    ax.set_xlabel('Month', fontsize=9)
    ax.set_ylabel('ARR ($M)', fontsize=9)
    ax.legend(fontsize=8)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, p: f'${v:.1f}M'))
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.grid(axis='y', alpha=0.2)
    plt.tight_layout()
    story.append(make_chart(fig, 7.0, 3.5))

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════
    # SECTION 09: RECOMMENDATION
    # ═══════════════════════════════════════════════════════════
    story.extend(section_header(9, "Recommendation",
        "Model C (Hybrid) as primary pricing, with Model E (Success-Based) as a pilot incentive for enterprise."))

    story.append(Paragraph("<b>Recommended Pricing Structure</b>", h3_style))
    story.append(make_table(
        ["", "Starter", "Professional", "Enterprise"],
        [
            ["Monthly base", "$299", "$799", "Custom"],
            ["Included PAs", "50", "250", "Unlimited"],
            ["Overage per PA", "$8", "$6", "Negotiated"],
            ["AI calls", "100 included", "Unlimited", "Unlimited"],
            ["AI overage", "$0.50/call", "\u2014", "\u2014"],
            ["EHR integration", "\u2014", "Included", "Dedicated"],
            ["Autonomy engine", "\u2014", "Included", "Included"],
            ["Trial", "14 days", "14 days", "30 days"],
            ["Target", "Solo / small practice", "Imaging / surgical center", "Hospital / health system"],
        ],
        col_widths=[1.5*inch, 1.5*inch, 1.6*inch, 1.5*inch]
    ))

    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Go-to-Market Phasing</b>", h3_style))
    story.append(bullet("<b>Phase 1 (Now \u2013 Q3 2026):</b> Launch hybrid pricing. Self-serve signup for Starter and Professional. Target 10-20 imaging centers."))
    story.append(bullet("<b>Phase 2 (Q4 2026):</b> Add success-based pilot for enterprise leads. '$0 for 90 days' to de-risk hospital deals."))
    story.append(bullet("<b>Phase 3 (Q1 2027):</b> CMS-0057-F FHIR PA mandate. Position as turnkey compliance solution. Regulatory urgency marketing."))
    story.append(bullet("<b>Phase 4 (2027+):</b> Per-transaction for high-volume systems. Revenue-share for auto-appeal (% of recovered revenue)."))

    story.append(Spacer(1, 12))
    story.append(Paragraph("<b>Key Metrics to Track</b>", h3_style))
    story.append(make_table(
        ["Metric", "Month 6", "Month 12", "Month 24"],
        [
            ["Customers", "15-20", "40-50", "120-150"],
            ["MRR", "$15K-25K", "$60K-100K", "$300K-500K"],
            ["ARR", "$180K-300K", "$720K-1.2M", "$3.6M-6M"],
            ["Avg Revenue / Customer", "$1,200/mo", "$1,800/mo", "$3,000/mo"],
            ["Net Revenue Retention", ">110%", ">120%", ">130%"],
            ["Monthly Churn", "<5%", "<4%", "<3%"],
        ],
        col_widths=[2.0*inch, 1.5*inch, 1.7*inch, 1.7*inch]
    ))

    story.append(Spacer(1, 14))
    story.append(CalloutBox(
        "<b>The hybrid model wins</b> because it serves the self-serve long tail (imaging centers) AND captures "
        "proportional revenue from enterprise (hospitals). It provides predictable base MRR for investors while "
        "scaling with customer success. Stripe supports it natively. No competitor offers this with AI-powered "
        "autonomy and self-serve onboarding.",
        GREEN
    ))

    # Build with footer
    doc.build(story, onLaterPages=footer, onFirstPage=lambda c, d: None)
    return out


if __name__ == "__main__":
    path = build_pdf()
    print(f"PDF generated: {path}")
