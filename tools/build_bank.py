from __future__ import annotations

import json
import re
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn


WORKSPACE = Path(__file__).resolve().parents[2]
OUTPUT_DIR = Path(__file__).resolve().parents[1]
ASSET_DIR = OUTPUT_DIR / "assets"

CHAPTERS = [
    "\u7b2c1\u7ae0 \u7f51\u7edc\u8bbe\u5907\u4e0eIP\u914d\u7f6e\u57fa\u7840",
    "\u7b2c2\u7ae0 IP\u5730\u5740\u3001\u5b50\u7f51\u4e0eOSI\u53c2\u8003\u6a21\u578b",
    "\u7b2c3\u7ae0 VLAN\u4e0e\u4ea4\u6362\u673a\u57fa\u7840",
    "\u7b2c4\u7ae0 \u5197\u4f59\u534f\u8bae\u4e0e\u73af\u7f51",
    "\u7b2c5\u7ae0 \u8def\u7531\u4e0e\u7f51\u7edc\u5c42\u534f\u8bae",
    "\u7b2c6\u7ae0 IP\u7ec4\u64ad\u4e0eIGMP",
    "\u7b2c7\u7ae0 \u65e0\u7ebf\u5c40\u57df\u7f51\u4e0e\u65e0\u7ebf\u7f51\u7edc\u6280\u672f",
    "\u7b2c8\u7ae0 \u9632\u706b\u5899\u4e0e\u7f51\u7edc\u5b89\u5168",
    "\u7b2c9\u7ae0 NAT\u4e0eVPN",
    "\u7b2c10\u7ae0 \u8bbf\u95ee\u63a7\u5236\u5217\u8868\uff08ACL\uff09",
]

QUESTION_RE = re.compile(
    r"^\u3010(\d+)\u3011\s*\u3010(\u5355\u9009\u9898|\u5224\u65ad\u9898)\u3011\s*(.*)$"
)
OPTION_RE = re.compile(r"(?<![A-Za-z0-9])([A-D])\s*[\u3001\uff0e.]\s*")
ANSWER_RE = re.compile(r"\u6b63\u786e\u7b54\u6848\uff1a\s*([A-D]|\u5bf9|\u9519)")
ANSWER_PREFIX = "\u6211\u7684\u7b54\u6848\uff1a"
ANALYSIS_PREFIX = "\u7b54\u6848\u89e3\u6790\uff1a"


def image_names(paragraph, document: Document) -> list[tuple[str, bytes]]:
    images: list[tuple[str, bytes]] = []
    for blip in paragraph._p.xpath(".//a:blip"):
        relationship_id = blip.get(qn("r:embed"))
        part = document.part.related_parts[relationship_id]
        images.append((Path(str(part.partname)).name, part.blob))
    return images


def split_options(value: str) -> list[tuple[str, str]]:
    matches = list(OPTION_RE.finditer(value))
    return [
        (
            match.group(1),
            value[match.end() : matches[index + 1].start() if index + 1 < len(matches) else None].strip(),
        )
        for index, match in enumerate(matches)
    ]


def build_question(raw: dict, sequence: int) -> dict:
    stem_parts = [raw["stem"]]
    options: list[dict[str, str]] = []
    question_images: list[str] = []
    explanation_images: list[str] = []
    answer = ""
    explanation = ""
    answer_seen = False

    for entry_index, entry in enumerate(raw["entries"]):
        value = entry["text"]
        if value.startswith(ANSWER_PREFIX):
            answer_seen = True
            answer_match = ANSWER_RE.search(value)
            if answer_match:
                answer = answer_match.group(1)
            if ANALYSIS_PREFIX in value:
                explanation = value.split(ANALYSIS_PREFIX, 1)[1].strip()

        target_images = explanation_images if answer_seen else question_images
        target_images.extend(f"assets/{name}" for name in entry["images"])

        if entry_index == 0 or answer_seen or not value:
            continue

        parsed_options = split_options(value)
        if parsed_options:
            options.extend({"key": key, "text": text} for key, text in parsed_options)
        elif options:
            options[-1]["text"] = f"{options[-1]['text']} {value}".strip()
        else:
            stem_parts.append(value)

    if raw["type"] == "\u5224\u65ad\u9898":
        options = [
            {"key": "\u5bf9", "text": "\u5bf9"},
            {"key": "\u9519", "text": "\u9519"},
        ]

    expected_keys = ["A", "B", "C", "D"] if raw["type"] == "\u5355\u9009\u9898" else ["\u5bf9", "\u9519"]
    actual_keys = [option["key"] for option in options]
    if actual_keys != expected_keys:
        raise ValueError(f"Unexpected options for question {sequence}: {actual_keys}")
    if answer not in expected_keys:
        raise ValueError(f"Unexpected answer for question {sequence}: {answer!r}")

    return {
        "id": f"q{sequence:03d}",
        "chapter": CHAPTERS[raw["chapter_index"]],
        "number": raw["number"],
        "type": "single" if raw["type"] == "\u5355\u9009\u9898" else "judgment",
        "stem": " ".join(part for part in stem_parts if part).strip(),
        "options": options,
        "answer": answer,
        "explanation": explanation,
        "questionImages": question_images,
        "explanationImages": explanation_images,
    }


def main() -> None:
    documents = sorted(WORKSPACE.glob("*.docx"), key=lambda path: path.stat().st_size, reverse=True)
    if not documents:
        raise FileNotFoundError("No DOCX question bank found")

    source = documents[0]
    document = Document(source)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)

    raw_questions: list[dict] = []
    current: dict | None = None
    chapter_index = -1
    written_assets: set[str] = set()

    for paragraph in document.paragraphs:
        value = paragraph.text.strip()
        if value.startswith("\u7b2c") and "\u7ae0 " in value:
            chapter_index += 1
            continue

        question_match = QUESTION_RE.match(value)
        if question_match:
            if current:
                raw_questions.append(current)
            current = {
                "chapter_index": chapter_index,
                "number": int(question_match.group(1)),
                "type": question_match.group(2),
                "stem": question_match.group(3),
                "entries": [],
            }

        if current is None:
            continue

        paragraph_images = image_names(paragraph, document)
        for name, blob in paragraph_images:
            if name not in written_assets:
                (ASSET_DIR / name).write_bytes(blob)
                written_assets.add(name)
        current["entries"].append(
            {"text": value, "images": [name for name, _ in paragraph_images]}
        )

    if current:
        raw_questions.append(current)

    if chapter_index + 1 != len(CHAPTERS):
        raise ValueError(f"Expected {len(CHAPTERS)} chapters, found {chapter_index + 1}")

    questions = [build_question(raw, index) for index, raw in enumerate(raw_questions, start=1)]
    if len(questions) != 100:
        raise ValueError(f"Expected 100 questions, found {len(questions)}")

    metadata = {
        "title": "\u4fe1\u606f\u7f51\u7edc\u5316\u79bb\u7ebf\u9898\u5e93",
        "total": len(questions),
        "chapters": CHAPTERS,
        "imageCount": len(written_assets),
    }
    output = (
        "window.QUESTION_BANK_META = "
        + json.dumps(metadata, ensure_ascii=False, separators=(",", ":"))
        + ";\nwindow.QUESTION_BANK = "
        + json.dumps(questions, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    (OUTPUT_DIR / "questions.js").write_text(output, encoding="utf-8")
    print(f"Built {len(questions)} questions and {len(written_assets)} images from {source.name}")


if __name__ == "__main__":
    main()
