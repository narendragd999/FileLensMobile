"""
seed_device_showcase_data.py — Generates realistic showcase documents and pushes them to the physical Android device.
"""

import os
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont

ADB = r"c:\Users\admin\Documents\Antigravity\platform-tools-latest-windows\platform-tools\adb.exe"

def make_sample_doc(filename, title, subtitle, lines, color_theme, pages_count=1):
    temp_dir = tempfile.gettempdir()
    filepath = os.path.join(temp_dir, filename)
    
    pages = []
    for p in range(pages_count):
        # A4 proportion: 1240 x 1754
        img = Image.new("RGB", (1240, 1754), color="#FFFFFF")
        draw = ImageDraw.Draw(img)
        
        # Header banner
        draw.rectangle([(0, 0), (1240, 180)], fill=color_theme)
        draw.text((60, 50), title, fill="#FFFFFF")
        draw.text((60, 110), f"{subtitle}  •  Page {p+1} of {pages_count}", fill="#E2E8F0")
        
        # Accent rule
        draw.rectangle([(0, 180), (1240, 190)], fill="#CBD5E1")
        
        # Content box
        y = 250
        draw.text((60, y), f"CONFIDENTIAL DOCUMENT — REFERENCE ID: FLP-{202600 + p}", fill="#64748B")
        y += 50
        draw.rectangle([(60, y), (1180, y + 2)], fill="#E2E8F0")
        y += 40
        
        for line in lines:
            if line.startswith("## "):
                y += 20
                draw.text((60, y), line.replace("## ", ""), fill="#0F172A")
                y += 45
            elif line.startswith("- "):
                draw.rectangle([(65, y+6), (73, y+14)], fill=color_theme)
                draw.text((90, y), line.replace("- ", ""), fill="#334155")
                y += 35
            else:
                draw.text((60, y), line, fill="#334155")
                y += 35
                
        # Footer
        draw.rectangle([(0, 1680), (1240, 1754)], fill="#F8FAFC")
        draw.text((60, 1705), "Digitized & Indexed by FileLens Pro • 100% Offline Document Suite", fill="#94A3B8")
        pages.append(img)
        
    if filename.lower().endswith(".pdf"):
        pages[0].save(filepath, "PDF", resolution=150.0, save_all=True, append_images=pages[1:] if len(pages) > 1 else [])
    else:
        pages[0].save(filepath, "PNG")
        
    return filepath

def main():
    print("Generating showcase documents for FileLens Pro...")
    
    docs_to_create = [
        (
            "Tax_Invoice_2026_Q3.pdf",
            "TAX INVOICE — INV-2026-8921",
            "Global Tech Solutions Pvt Ltd  •  GSTIN: 27AABCU9603R1ZM",
            [
                "## BILL TO",
                "Client: FileLens Systems India LLP",
                "Address: Suite 402, Cyber Tower Phase 2, Bengaluru - 560001",
                "Invoice Date: 22 September 2026  •  Due Date: 22 October 2026",
                "",
                "## ITEM DETAILS",
                "- Cloud Computing & Dedicated GPU Compute Cluster (Sep 2026) — INR 32,500.00",
                "- High-Availability Storage Quota 500GB — INR 8,601.69",
                "",
                "## TAX BREAKDOWN",
                "Subtotal: INR 41,101.69",
                "IGST (18.0%): INR 7,398.31",
                "TOTAL PAYABLE: INR 48,500.00",
                "",
                "Payment Status: PAID IN FULL (Ref: RTGS/4892019/HDFC)",
            ],
            "#0284C7",
            4
        ),
        (
            "Office_Lease_Agreement_Executed.pdf",
            "COMMERCIAL LEASE AGREEMENT",
            "Prime Realty Corp & FileLens Systems  •  Term: 36 Months",
            [
                "## PARTIES & PREMISES",
                "Lessor: Prime Realty Commercial Infrastructure Pvt Ltd",
                "Lessee: FileLens Systems India LLP",
                "Premises: Unit 402, 4th Floor, Tower B, Cyber City, Bengaluru",
                "",
                "## KEY COVENANTS",
                "- Monthly Rent: INR 1,25,000/- payable on or before 5th of each calendar month.",
                "- Interest-Free Refundable Security Deposit: INR 7,50,000/-.",
                "- Annual Escalation: 5.0% on base rent after completion of each 12-month period.",
                "- Lock-in Period: 36 Months from possession date 01 April 2026.",
                "- Dedicated Covered Stilt Parking Spaces: 4 bays (Bay #41 to #44).",
                "",
                "Status: Duly Signed, Sealed, and Notarized.",
            ],
            "#4F46E5",
            12
        ),
        (
            "Health_Insurance_Policy_2026.pdf",
            "STAR HEALTH COMPREHENSIVE POLICY",
            "Policy Number: P/161111/01/2026/008492  •  Tier: Gold Floater",
            [
                "## POLICY SCHEDULE",
                "Proposer / Primary Insured: Rahul Sharma (DOB: 15/08/1992)",
                "Sum Insured: INR 25,00,000 (Twenty-Five Lakhs)",
                "Cumulative Bonus Accrued: INR 5,00,000",
                "Total Coverage: INR 30,00,000",
                "",
                "## BENEFIT HIGHLIGHTS",
                "- Cashless Hospitalization across 14,000+ network hospitals nationwide.",
                "- Zero Room Rent capping on all single private rooms.",
                "- Pre & Post Hospitalization expenses covered (60 & 90 days).",
                "- Annual Comprehensive Health Checkup coupon activated.",
                "",
                "Toll-Free 24x7 Emergency Assistance: 1800-425-2255",
            ],
            "#059669",
            8
        ),
        (
            "Passport_Application_Summary.pdf",
            "PASSPORT SEVA APPOINTMENT RECEIPT",
            "Ministry of External Affairs, Govt of India  •  ARN: 26-1004928174",
            [
                "## APPOINTMENT DETAILS",
                "Applicant Name: Rahul Sharma",
                "Date of Birth: 15/08/1992",
                "Appointment Date & Batch: 14 October 2026, 10:15 AM (Batch A4)",
                "Passport Seva Kendra: Lalbagh Road PSK, Bengaluru",
                "",
                "## DOCUMENTS SUBMISSION CHECKLIST",
                "- Proof of Date of Birth: Birth Certificate / Aadhaar Card (Verified)",
                "- Proof of Present Address: Bank Passbook / Electricity Bill (Verified)",
                "- Annexure E & Prior Passport (If applicable)",
                "",
                "Fee Paid: INR 1,500/- (Normal Scheme, 36 Pages Booklet)",
            ],
            "#D97706",
            3
        ),
        (
            "Annual_Audit_Report_2026.pdf",
            "STATUTORY AUDIT & FINANCIAL REPORT",
            "Financial Year 2025-2026  •  Independent Auditors Report",
            [
                "## EXECUTIVE SUMMARY",
                "To the Members of FileLens Technologies Private Limited:",
                "We have audited the accompanying financial statements of the Company,",
                "which comprise the Balance Sheet as of March 31, 2026, and Statement of Profit & Loss.",
                "",
                "## FINANCIAL HIGHLIGHTS",
                "- Total Operating Revenue: INR 1,84,20,000 (+41.8% YoY)",
                "- Net Profit Before Tax: INR 52,40,000",
                "- EBITDA Margin: 28.4%",
                "- Free Cash Flow: Positive throughout all four quarters",
                "",
                "Opinion: Unqualified Clean Audit Opinion with zero remarks.",
            ],
            "#7C3AED",
            18
        ),
        (
            "Architecture_System_Design.png",
            "FILELENS PRO — SYSTEM ARCHITECTURE",
            "100% On-Device Neural Search & Document Engine",
            [
                "## ARCHITECTURE LAYERS",
                "- UI Layer: React Native + Expo Router + Native Reanimated 3",
                "- Search Engine: SQLite FTS5 Full-Text Search with Unicode Tokenizer",
                "- AI Embeddings: MiniLM-L6 Neural Vectors (Quantized Local Inference)",
                "- OCR Pipeline: On-Device Tesseract C++ Engine (Zero Cloud Dependencies)",
                "- Storage Engine: Direct SAF + FileSystem Scoped Directory Bridge",
                "",
                "Privacy Guarantee: 0 Bytes Transmitted to External Servers.",
            ],
            "#0F172A",
            1
        ),
    ]

    # Create target directories on device
    print("Ensuring target folders on device...")
    subprocess.run([ADB, "shell", "mkdir", "-p", "/sdcard/Documents/FileLensPro/"])
    subprocess.run([ADB, "shell", "mkdir", "-p", "/sdcard/Download/"])

    for filename, title, subtitle, lines, color, pages in docs_to_create:
        local_path = make_sample_doc(filename, title, subtitle, lines, color, pages)
        print(f"Generated {filename} ({pages} page(s)). Pushing to device...")
        
        # Push to Documents/FileLensPro
        subprocess.run([ADB, "push", local_path, f"/sdcard/Documents/FileLensPro/{filename}"])
        # Also push a couple to Download for downloads directory showcase
        if "Invoice" in filename or "Passport" in filename or "Architecture" in filename:
            subprocess.run([ADB, "push", local_path, f"/sdcard/Download/{filename}"])
            
        # Trigger MediaStore broadcast
        subprocess.run([
            ADB, "shell", "am", "broadcast",
            "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
            "-d", f"file:///sdcard/Documents/FileLensPro/{filename}"
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    print("All physical showcase files successfully pushed to device!")

if __name__ == "__main__":
    main()
