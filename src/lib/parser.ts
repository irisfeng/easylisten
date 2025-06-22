import pdf from "pdf-parse";
// import { createWorker } from "tesseract.js";
import unzipper from "unzipper";
import xml2js from "xml2js";
import * as cheerio from "cheerio";
import jschardet from "jschardet";
import { TextDecoder } from "util";
import mammoth from "mammoth";

interface ParseResult {
  text: string;
  metadata?: Record<string, unknown>;
}

export async function parseFileContent(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ParseResult> {
  switch (mimeType) {
    case "application/pdf":
      return parsePdf(fileBuffer);
    case "application/epub+zip":
      return parseEpub(fileBuffer);
    case "text/plain":
      return parseTxt(fileBuffer);
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return parseDocx(fileBuffer);
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

async function parsePdf(fileBuffer: Buffer): Promise<ParseResult> {
  const data = await pdf(fileBuffer);

  // if (data.text && data.text.trim().length > 100) {
  return { text: data.text, metadata: data.info };
  // }

  // console.log("Skipping pdf-parse due to a bug, going straight to OCR with Tesseract...");
  // // Note: temporarily removing logger to avoid persistent type issues.
  // const worker = await createWorker('eng+chi_sim', 1, {
  //   // langPath 仍然建议保留，以加快语言数据的下载速度
  //   langPath: 'https://tessdata.projectnaptha.com/4.0.0_best', 
  //   // logger: m => console.log(m), // 可以在需要时取消注释来调试
  // });
  // const { data: { text } } = await worker.recognize(fileBuffer);
  // await worker.terminate();
  
  // if (!text) {
  //   throw new Error("Failed to extract text using Tesseract OCR.");
  // }

  // return { text };
}

async function parseEpub(fileBuffer: Buffer): Promise<ParseResult> {
  const directory = await unzipper.Open.buffer(fileBuffer);
  
  const containerFile = directory.files.find((f: unzipper.File) => f.path === "META-INF/container.xml");
  if (!containerFile) throw new Error("Invalid EPUB: META-INF/container.xml not found.");
  const containerXml = await containerFile.buffer();
  const containerData = await xml2js.parseStringPromise(containerXml.toString());
  const contentPath: string = containerData.container.rootfiles[0].rootfile[0].$['full-path'];

  const contentFile = directory.files.find((f: unzipper.File) => f.path === contentPath);
  if (!contentFile) throw new Error(`Invalid EPUB: ${contentPath} not found.`);
  const contentXml = await contentFile.buffer();
  const contentData = await xml2js.parseStringPromise(contentXml.toString());

  const manifest: { $: { id: string, href: string } }[] = contentData.package.manifest[0].item;
  const spine: { $: { idref: string } }[] = contentData.package.spine[0].itemref;
  
  const contentBasePath = contentPath.substring(0, contentPath.lastIndexOf('/'));
  let fullText = "";

  for (const item of spine) {
    const manifestItem = manifest.find((m) => m.$.id === item.$.idref);
    if (!manifestItem) continue;

    const chapterPath = contentBasePath ? `${contentBasePath}/${manifestItem.$.href}` : manifestItem.$.href;
    const chapterFile = directory.files.find((f: unzipper.File) => f.path === chapterPath);
    if (!chapterFile) continue;

    const chapterContent = await chapterFile.buffer();
    const $ = cheerio.load(chapterContent.toString());
    fullText += $("body").text().trim() + "\n\n";
  }

  return { text: fullText };
}

async function parseTxt(fileBuffer: Buffer): Promise<ParseResult> {
  const detectedEncoding = jschardet.detect(fileBuffer);
  
  if (!detectedEncoding || !detectedEncoding.encoding) {
    console.warn("Could not detect encoding, falling back to UTF-8.");
    return { text: fileBuffer.toString("utf-8") };
  }

  try {
    const decoder = new TextDecoder(detectedEncoding.encoding);
    const text = decoder.decode(fileBuffer);
    return { text };
  } catch (err) {
    console.warn(`Failed to decode with ${detectedEncoding.encoding}, falling back to UTF-8.`, err);
    return { text: fileBuffer.toString("utf-8") };
  }
}

async function parseDocx(fileBuffer: Buffer): Promise<ParseResult> {
  const { value: text } = await mammoth.extractRawText({ buffer: fileBuffer });
  return { text };
}