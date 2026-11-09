# Usage: python3 make_qr.py <url> [out.png]  -> high-contrast QR for the banner
import sys, qrcode
img = qrcode.make(sys.argv[1], border=0, box_size=10, error_correction=qrcode.constants.ERROR_CORRECT_M)
img.save(sys.argv[2] if len(sys.argv) > 2 else 'qr.png')
