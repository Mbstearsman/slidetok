"""
slidetok backend API  (deploy on Render)
========================================
Wraps generate_images.generate_slideshow() in a small Flask API so the
Netlify frontend can POST uploaded files + settings and get back a zip
of finished 9:16 slides.

Endpoints:
  GET  /            health check
  POST /columns     upload a captions file -> {columns, rows} (drives the
                    per-slide color pickers in the UI)
  POST /generate    upload everything -> slides.zip
"""

import io
import os
import json
import shutil
import zipfile
import tempfile

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
import pandas as pd

from generate_images import generate_slideshow

app = Flask(__name__)
CORS(app)  # allow the Netlify site to call this API

MAX_CONTENT_MB = 100
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_MB * 1024 * 1024


@app.route("/")
def health():
    return jsonify({"status": "ok", "service": "slidetok"})


@app.route("/columns", methods=["POST"])
def columns():
    """Report how many slides (columns) and posts (rows) a captions file has."""
    if "captions" not in request.files:
        return jsonify({"error": "No captions file uploaded."}), 400
    f = request.files["captions"]
    work = tempfile.mkdtemp()
    try:
        path = os.path.join(work, secure_filename(f.filename) or "captions.csv")
        f.save(path)
        if path.lower().endswith(".ods"):
            df = pd.read_excel(path, engine="odf", header=None)
        elif path.lower().endswith((".xlsx", ".xlsm")):
            df = pd.read_excel(path, engine="openpyxl", header=None)
        else:
            df = pd.read_csv(path, header=None)
        return jsonify({"columns": int(df.shape[1]), "rows": int(df.shape[0])})
    except Exception as e:
        return jsonify({"error": f"Could not read captions file: {e}"}), 400
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _json_list(key):
    raw = request.form.get(key, "")
    try:
        return json.loads(raw) if raw else []
    except Exception:
        return []


@app.route("/generate", methods=["POST"])
def generate():
    work = tempfile.mkdtemp()
    try:
        bg_dir = os.path.join(work, "bg")
        out_dir = os.path.join(work, "out")
        os.makedirs(bg_dir)
        os.makedirs(out_dir)

        # required uploads (font is optional — falls back to bundled default)
        if "captions" not in request.files:
            return jsonify({"error": "A captions file is required."}), 400

        captions = request.files["captions"]
        cpath = os.path.join(work, secure_filename(captions.filename) or "captions.csv")
        captions.save(cpath)

        fpath = None
        if "font" in request.files and request.files["font"].filename:
            font = request.files["font"]
            fpath = os.path.join(work, secure_filename(font.filename) or "font.ttf")
            font.save(fpath)

        bgs = request.files.getlist("backgrounds")
        if not bgs:
            return jsonify({"error": "Please upload at least one background image."}), 400
        for f in bgs:
            if f.filename:
                f.save(os.path.join(bg_dir, secure_filename(f.filename)))

        # optional CTA image — make sure its name contains 'cta' so the
        # engine recognizes it
        if "cta" in request.files and request.files["cta"].filename:
            cta = request.files["cta"]
            name = secure_filename(cta.filename)
            if "cta" not in name.lower():
                name = "cta_" + name
            cta.save(os.path.join(bg_dir, name))

        cta_slide_raw = request.form.get("cta_slide", "").strip()

        generate_slideshow(
            csv_path=cpath,
            bg_folder=bg_dir,
            font_path=fpath,
            output_folder=out_dir,
            num_posts=int(request.form.get("num_posts", "1") or 1),
            cta_slide=int(cta_slide_raw) if cta_slide_raw.isdigit() else None,
            bubble_words=[w.strip() for w in request.form.get("bubble_words", "").split(",") if w.strip()],
            bubble_color_list=_json_list("bubble_colors"),
            text_color_list=_json_list("text_colors"),
            outline_color_list=_json_list("outline_colors"),
            bubble_word_text_color=request.form.get("bubble_word_text_color", "#000000"),
            bubble_word_fill_color=request.form.get("bubble_word_fill_color", "#FFFFFF"),
            font_size=int(request.form.get("font_size", "45") or 45),
            lock_font_size=request.form.get("lock_font_size", "true").lower() == "true",
            random_backgrounds=request.form.get("random_backgrounds", "true").lower() == "true",
            caption_offset=int(request.form.get("caption_offset", "0") or 0),
        )

        # zip the output folder in memory
        mem = io.BytesIO()
        count = 0
        with zipfile.ZipFile(mem, "w", zipfile.ZIP_DEFLATED) as z:
            for root, _, files in os.walk(out_dir):
                for fn in files:
                    full = os.path.join(root, fn)
                    z.write(full, os.path.relpath(full, out_dir))
                    count += 1
        if count == 0:
            return jsonify({"error": "No slides were produced. Check that your captions file has text."}), 400
        mem.seek(0)
        return send_file(
            mem, mimetype="application/zip",
            as_attachment=True, download_name="slides.zip",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
