import { jsPDF } from "jspdf";
import JSZip from "jszip";

export const exportToMarkdown = (title: string, content: string, coverUrl?: string) => {
  let fullContent = `# ${title}\n\n`;
  if (coverUrl) {
    fullContent += `![Cover](${coverUrl})\n\n`;
  }
  fullContent += content;
  
  const blob = new Blob([fullContent], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\s+/g, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportToPDF = async (title: string, content: string, coverUrl?: string) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxLineWidth = pageWidth - (margin * 2);
  
  let y = 30;

  // Cover Page
  if (coverUrl) {
    try {
      doc.addImage(coverUrl, 'PNG', 0, 0, pageWidth, pageHeight);
      doc.addPage();
    } catch (e) {
      console.error("Could not add cover to PDF", e);
    }
  }
  
  // Title Page
  doc.setFont("playfair", "bold");
  doc.setFontSize(26);
  const titleLines = doc.splitTextToSize(title, maxLineWidth);
  doc.text(titleLines, margin, y);
  y += (titleLines.length * 10) + 20;

  // Content processing
  const lines = content.split("\n");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  lines.forEach((line) => {
    if (!line.trim()) {
      y += 5; // Paragraph spacing
      return;
    }

    // Simple MD parsing for PDF
    let currentFont = "helvetica";
    let currentStyle = "normal";
    let currentSize = 11;

    let cleanLine = line;

    if (line.startsWith("## ")) {
      currentStyle = "bold";
      currentSize = 16;
      cleanLine = line.replace("## ", "");
      y += 10;
    } else if (line.startsWith("# ")) {
      currentStyle = "bold";
      currentSize = 20;
      cleanLine = line.replace("# ", "");
      y += 12;
    }

    // Handle bold markers **text** by stripping them for now (jsPDF basic doesn't support inline mixed styles easily)
    cleanLine = cleanLine.replace(/\*\*(.*?)\*\*/g, "$1");

    doc.setFont(currentFont, currentStyle);
    doc.setFontSize(currentSize);

    const splitLines = doc.splitTextToSize(cleanLine, maxLineWidth);
    
    if (y + (splitLines.length * 7) > 280) {
      doc.addPage();
      y = 20;
    }

    doc.text(splitLines, margin, y);
    y += (splitLines.length * 7);
  });
  
  doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
};

const mdToHtml = (md: string) => {
  return md
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/\n/gim, '<br/>')
    .replace(/<br\/><br\/>/gim, '</p><p>');
};

export const exportToEPUB = async (title: string, chapters: { title: string; content: string }[], coverUrl?: string) => {
  const zip = new JSZip();
  
  zip.file("mimetype", "application/epub+zip");
  
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.folder("META-INF")?.file("container.xml", containerXml);
  
  const oebps = zip.folder("OEBPS");
  
  let manifestItems = "";
  let spineItems = "";
  
  // Add cover image if exists
  if (coverUrl) {
    const base64Data = coverUrl.split(',')[1];
    oebps?.file("cover.png", base64Data, { base64: true });
    manifestItems += `<item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/>\n`;
    
    const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Cover</title></head>
<body style="margin:0;padding:0;text-align:center;">
  <img src="cover.png" style="max-width:100%;height:auto;" />
</body>
</html>`;
    oebps?.file("cover.xhtml", coverXhtml);
    manifestItems += `<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>\n`;
    spineItems += `<itemref idref="cover"/>\n`;
  }

  chapters.forEach((ch, i) => {
    const fileName = `chapter_${i}.xhtml`;
    const htmlContent = mdToHtml(ch.content);
    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${ch.title}</title>
  <style>
    body { font-family: serif; line-height: 1.6; padding: 5%; }
    h1 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
    h2 { color: #666; margin-top: 2em; }
    p { margin-bottom: 1.2em; text-align: justify; }
    strong { font-weight: bold; }
  </style>
</head>
<body>
  <h1>${ch.title}</h1>
  <div class="content">
    <p>${htmlContent}</p>
  </div>
</body>
</html>`;
    oebps?.file(fileName, xhtml);
    manifestItems += `<item id="ch${i}" href="${fileName}" media-type="application/xhtml+xml"/>\n`;
    spineItems += `<itemref idref="ch${i}"/>\n`;
  });
  
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">id-${Date.now()}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:language>de</dc:language>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;
  oebps?.file("content.opf", contentOpf);
  
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\s+/g, "_")}.epub`;
  a.click();
  URL.revokeObjectURL(url);
};
