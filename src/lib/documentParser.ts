import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ──────────────────────────────────────────────
//  SYSTEM 1 — FORENSIC FILE PARSING
// ──────────────────────────────────────────────

/**
 * The No-Column Rule: every file is treated as unstructured raw data.
 * No column header mapping. Full text extraction, flat stream.
 */

// Wellness / health keywords for frequency tallying (lowercase)
const WELLNESS_SEED_KEYWORDS = [
  "ashwagandha", "shilajit", "berberine", "sea moss", "probiotics", "psychobiotics",
  "collagen", "biotin", "melatonin", "turmeric", "curcumin", "moringa", "spirulina",
  "whey protein", "creatine", "omega-3", "vitamin d", "zinc", "magnesium", "iron",
  "ayurveda", "ayurvedic", "panchakarma", "rasayana", "adaptogens", "nootropics",
  "gut health", "microbiome", "sleep aid", "stress relief", "immunity", "hair loss",
  "skin care", "anti-aging", "weight loss", "muscle gain", "pcos", "pcod", "menopause",
  "hormonal", "testosterone", "fertility", "sexual wellness", "beard care",
  "kids nutrition", "child immunity", "prenatal", "postpartum", "keto", "intermittent fasting",
  "plant-based", "vegan protein", "millets", "superfoods", "cbd", "hemp",
  "sea buckthorn", "triphala", "brahmi", "shatavari", "amla", "neem",
  "wellness", "supplement", "nutraceutical", "d2c", "direct to consumer",
];

/**
 * Source type classification based on filename and content patterns.
 */
function classifySourceType(fileName: string, content: string): string {
  const fn = fileName.toLowerCase();
  const sample = content.substring(0, 2000).toLowerCase();

  if (fn.includes("reddit") || sample.includes("r/") || sample.includes("upvote") || sample.includes("subreddit"))
    return "Reddit Thread";
  if (fn.includes("youtube") || sample.includes("youtube.com") || sample.includes("views") && sample.includes("subscribers"))
    return "YouTube Metadata";
  if (fn.includes("amazon") || sample.includes("amazon.in") || sample.includes("add to cart") || sample.includes("customer review"))
    return "Amazon Product Listing";
  if (fn.includes("research") || fn.includes("paper") || sample.includes("abstract") && sample.includes("methodology"))
    return "Research Paper";
  if (fn.includes("mckinsey") || fn.includes("redseer") || fn.includes("imarc") || fn.includes("statista") || fn.includes("euromonitor") || sample.includes("cagr") || sample.includes("total addressable market"))
    return "Consulting Report";
  if (fn.includes("news") || fn.includes("article") || sample.includes("reported by") || sample.includes("according to") || sample.includes("press release"))
    return "News Article";

  return "Unknown — scan for all signal types";
}

/**
 * Tallies keyword frequencies across the full corpus.
 * Returns keywords appearing 3+ times.
 */
function tallyKeywordFrequencies(
  documentTexts: { fileName: string; text: string }[]
): { keyword: string; count: number; documentCount: number }[] {
  const keywordStats: Record<string, { count: number; docs: Set<string> }> = {};

  // Also detect new keywords dynamically: any capitalized multi-word phrase appearing often
  const allText = documentTexts.map((d) => d.text).join(" ").toLowerCase();

  for (const kw of WELLNESS_SEED_KEYWORDS) {
    const kwLower = kw.toLowerCase();
    let totalCount = 0;
    const docsContaining = new Set<string>();

    for (const doc of documentTexts) {
      const docLower = doc.text.toLowerCase();
      const regex = new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = docLower.match(regex);
      if (matches) {
        totalCount += matches.length;
        docsContaining.add(doc.fileName);
      }
    }

    if (totalCount >= 3) {
      keywordStats[kw] = { count: totalCount, docs: docsContaining };
    }
  }

  return Object.entries(keywordStats)
    .map(([keyword, stats]) => ({
      keyword,
      count: stats.count,
      documentCount: stats.docs.size,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Main entry point: processes all files into a forensically tagged corpus
 * with keyword frequency summary and noise filtering instruction.
 */
export async function buildForensicCorpus(files: File[]): Promise<{
  corpus: string;
  fileNames: string;
}> {
  // Step 1 — Full text extraction (No-Column Rule)
  const documentTexts: { fileName: string; text: string }[] = [];

  const extractions = await Promise.all(
    files.map(async (file) => {
      const text = await extractTextFromFile(file);
      return { fileName: file.name, text };
    })
  );
  documentTexts.push(...extractions);

  // Step 2 — Keyword frequency tallying
  const frequencies = tallyKeywordFrequencies(documentTexts);
  let frequencySummary = "PRE-SCAN FREQUENCY SUMMARY:\n";
  if (frequencies.length === 0) {
    frequencySummary += "No wellness keywords met the 3-occurrence threshold.\n";
  } else {
    for (const f of frequencies) {
      frequencySummary += `Keyword '${f.keyword}' appears ${f.count} times across ${f.documentCount} document(s).\n`;
    }
  }

  // Step 3 — Source-type tagging
  const taggedBlocks: string[] = [];
  for (const doc of documentTexts) {
    const sourceType = classifySourceType(doc.fileName, doc.text);
    taggedBlocks.push(
      `[SOURCE: ${sourceType} — ${doc.fileName}]\n\n${doc.text}`
    );
  }

  // Step 4 — Noise filtering instruction
  const noiseFilter = `PARSER NOTE: This corpus has been pre-scanned. Ignore any content that does not contain a wellness, health, nutrition, supplement, personal care, fitness, or Ayurveda signal relevant to the Indian market. Financial tables, general political news, sports content, entertainment content, and any topic not directly related to wellness trends must be skipped entirely. Do not extract, score, or reference any signal from noise content even if it appears frequently.`;

  // Assemble final corpus
  const corpus = [
    noiseFilter,
    "",
    frequencySummary,
    "",
    "═══ TAGGED DOCUMENT CORPUS ═══",
    "",
    ...taggedBlocks.map((block, i) => `--- DOCUMENT ${i + 1} ---\n${block}`),
  ].join("\n");

  const fileNames = files.map((f) => f.name).join(", ");

  return { corpus, fileNames };
}

// ──────────────────────────────────────────────
//  FILE EXTRACTION FUNCTIONS (unchanged core logic, No-Column Rule enforced)
// ──────────────────────────────────────────────

/**
 * Extract readable text from a file — treats ALL files as unstructured data.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  // Plain text files
  if (
    file.type === "text/plain" ||
    file.type === "text/csv" ||
    file.type === "text/markdown" ||
    name.endsWith(".txt") ||
    name.endsWith(".csv") ||
    name.endsWith(".md") ||
    name.endsWith(".json") ||
    name.endsWith(".xml")
  ) {
    return await file.text();
  }

  // PDF files
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return await extractPdfText(file);
  }

  // Excel files — flatten to text stream, NO column mapping
  if (
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel" ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  ) {
    return await extractExcelText(file);
  }

  // Word documents
  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return await extractDocxText(file);
  }

  // Images - send as base64 for AI to interpret
  if (file.type.startsWith("image/")) {
    return await fileToBase64Description(file);
  }

  // Fallback: try reading as text
  try {
    const text = await file.text();
    if (text && text.length > 20 && isPrintableText(text)) {
      return text;
    }
  } catch {}

  return await fileToBase64Description(file);
}

async function extractPdfText(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    const textParts: string[] = [];

    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join(" ");
      if (pageText.trim()) {
        textParts.push(`[Page ${i}]\n${pageText}`);
      }
    }

    const result = textParts.join("\n\n");
    if (result.trim().length > 50) {
      return `[PDF: ${file.name}, ${totalPages} pages]\n\n${result}`;
    }

    console.warn(`PDF "${file.name}" yielded minimal text, sending as image data`);
    return await fileToBase64Description(file);
  } catch (err) {
    console.error(`PDF parsing error for "${file.name}":`, err);
    return await fileToBase64Description(file);
  }
}

async function extractExcelText(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheetTexts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      // No-Column Rule: convert every cell to flat text, no header interpretation
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (csv.trim()) {
        sheetTexts.push(`[Sheet: ${sheetName}]\n${csv}`);
      }
    }

    return `[Excel: ${file.name}, ${workbook.SheetNames.length} sheets]\n\n${sheetTexts.join("\n\n")}`;
  } catch (err) {
    console.error(`Excel parsing error for "${file.name}":`, err);
    return `[Could not parse Excel file: ${file.name}]`;
  }
}

async function extractDocxText(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    const textDecoder = new TextDecoder("utf-8", { fatal: false });
    const rawText = textDecoder.decode(uint8);

    const paragraphs: string[] = [];
    const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let match;
    while ((match = regex.exec(rawText)) !== null) {
      if (match[1].trim()) {
        paragraphs.push(match[1]);
      }
    }

    if (paragraphs.length > 0) {
      return `[DOCX: ${file.name}]\n\n${paragraphs.join(" ")}`;
    }

    return `[Could not extract text from DOCX: ${file.name}]`;
  } catch (err) {
    console.error(`DOCX parsing error for "${file.name}":`, err);
    return `[Could not parse DOCX file: ${file.name}]`;
  }
}

async function fileToBase64Description(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1] || "";
      const truncated = base64.substring(0, 50000);
      resolve(`[Binary file: ${file.name}, Type: ${file.type}, Size: ${(file.size / 1024).toFixed(1)}KB]\n[Base64 content — first 50K chars]\n${truncated}`);
    };
    reader.onerror = () => resolve(`[Could not read file: ${file.name}]`);
    reader.readAsDataURL(file);
  });
}

function isPrintableText(text: string): boolean {
  const sample = text.substring(0, 200);
  const printable = sample.replace(/[^\x20-\x7E\n\r\t\u00A0-\uFFFF]/g, "");
  return printable.length / sample.length > 0.8;
}
