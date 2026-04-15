import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { BookParameters, GenerationMetadata } from "../types";

const generateMetadataMarkdown = (title: string, params: BookParameters, metadata?: GenerationMetadata) => {
  return `
---
# Metadaten zur Erstellung
**Buchtitel:** ${title}
**Erstellungsdatum:** ${new Date().toLocaleDateString('de-DE')}
**Text-Modell:** ${params.preferredModel}
**Bild-Modell:** ${params.imageModel}
**Gesamt-Wortzahl:** ${metadata?.totalWordsGenerated || 'Unbekannt'}
**Anzahl der KI-Anfragen:** ${metadata?.totalRequests || 'Unbekannt'}

### Verwendete Parameter:
- **Zielgruppe:** ${params.targetAudience}
- **Erzählperspektive:** ${params.narrativePerspective}
- **Sprachstil:** ${params.languageStyle}
- **Lokalisierung:** ${params.localization}
- **Struktur:** ${params.structureType}
- **Persona:** ${params.persona}
- **Interaktivität:** Stufe ${params.interactivity} von 4
- **Zusatzmaterialien:** ${[
    params.generateWorksheets ? "Arbeitsblätter" : "",
    params.generateCheatSheet ? "Spickzettel" : "",
    params.generateActionPlan ? "Aktionsplan" : "",
    params.generateChapterImages ? "Kapitelbilder" : ""
  ].filter(Boolean).join(", ") || "Keine"}

*Dieses Buch wurde mit dem AI Book Architect erstellt.*
---
`;
};

export const exportToMarkdown = (title: string, content: string, coverUrl?: string, chapters?: { title: string }[], params?: BookParameters, metadata?: GenerationMetadata) => {
  let fullContent = `# ${title}\n\n`;
  if (coverUrl) {
    fullContent += `![Cover](${coverUrl})\n\n`;
  }

  if (chapters && chapters.length > 0) {
    fullContent += `## Inhaltsverzeichnis\n\n`;
    chapters.forEach((ch, i) => {
      fullContent += `${i + 1}. ${ch.title}\n`;
    });
    fullContent += `\n---\n\n`;
  }

  fullContent += content;

  if (params?.includeMetadataPage) {
    fullContent += `\n\n${generateMetadataMarkdown(title, params, metadata)}`;
  }
  
  const blob = new Blob([fullContent], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\s+/g, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportToCAsMarkdown = (title: string, chapters: { title: string; description: string }[]) => {
  let content = `# Inhaltsverzeichnis: ${title}\n\n`;
  chapters.forEach((ch, i) => {
    content += `## Kapitel ${i + 1}: ${ch.title}\n${ch.description}\n\n`;
  });
  
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ToC_${title.replace(/\s+/g, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportToPDF = async (title: string, content: string, coverUrl?: string, chapters?: { title: string; imageUrl?: string }[], params?: BookParameters, metadata?: GenerationMetadata) => {
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

  // Table of Contents in PDF
  if (chapters && chapters.length > 0) {
    doc.setFontSize(18);
    doc.text("Inhaltsverzeichnis", margin, y);
    y += 15;
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    chapters.forEach((ch, i) => {
      const line = `${i + 1}. ${ch.title}`;
      doc.text(line, margin, y);
      y += 8;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });
    doc.addPage();
    y = 30;
  }

  // Content processing
  const lines = content.split("\n");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  let currentChapterIndex = -1;

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
      currentChapterIndex++;
      
      // Check for chapter image
      if (chapters && chapters[currentChapterIndex] && chapters[currentChapterIndex].imageUrl) {
        try {
          // Add image before chapter title or after? Let's do after.
          // But first check if we need a new page for the title
          if (y > 250) {
            doc.addPage();
            y = 20;
          }
        } catch (e) {}
      }
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

    // If it was a chapter title, add the image now
    if (line.startsWith("## ") && chapters && chapters[currentChapterIndex] && chapters[currentChapterIndex].imageUrl) {
      try {
        const imgUrl = chapters[currentChapterIndex].imageUrl!;
        // Aspect ratio 16:9
        const imgHeight = maxLineWidth * (9/16);
        if (y + imgHeight > 270) {
          doc.addPage();
          y = 20;
        }
        doc.addImage(imgUrl, 'PNG', margin, y, maxLineWidth, imgHeight);
        y += imgHeight + 10;
      } catch (e) {
        console.error("Error adding chapter image to PDF", e);
      }
    }
  });

  // Metadata Page in PDF
  if (params?.includeMetadataPage) {
    doc.addPage();
    y = 30;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Metadaten zur Erstellung", margin, y);
    y += 15;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    
    const metaLines = [
      `Buchtitel: ${title}`,
      `Erstellungsdatum: ${new Date().toLocaleDateString('de-DE')}`,
      `Text-Modell: ${params.preferredModel}`,
      `Bild-Modell: ${params.imageModel}`,
      `Gesamt-Wortzahl: ${metadata?.totalWordsGenerated || 'Unbekannt'}`,
      `Anzahl der KI-Anfragen: ${metadata?.totalRequests || 'Unbekannt'}`,
      "",
      "Verwendete Parameter:",
      `- Zielgruppe: ${params.targetAudience}`,
      `- Erzählperspektive: ${params.narrativePerspective}`,
      `- Sprachstil: ${params.languageStyle}`,
      `- Lokalisierung: ${params.localization}`,
      `- Struktur: ${params.structureType}`,
      `- Persona: ${params.persona}`,
      `- Interaktivität: Stufe ${params.interactivity} von 4`,
      `- Zusatzmaterialien: ${[
        params.generateWorksheets ? "Arbeitsblätter" : "",
        params.generateCheatSheet ? "Spickzettel" : "",
        params.generateActionPlan ? "Aktionsplan" : "",
        params.generateChapterImages ? "Kapitelbilder" : ""
      ].filter(Boolean).join(", ") || "Keine"}`
    ];

    metaLines.forEach(line => {
      doc.text(line, margin, y);
      y += 7;
    });
  }
  
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

export const exportToEPUB = async (title: string, chapters: { title: string; content: string; imageUrl?: string }[], coverUrl?: string, params?: BookParameters, metadata?: GenerationMetadata) => {
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
  let navItems = "";
  let tocHtmlItems = "";
  
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

  // Add chapter images to manifest
  chapters.forEach((ch, i) => {
    if (ch.imageUrl) {
      const base64Data = ch.imageUrl.split(',')[1];
      const imgName = `chapter_img_${i}.png`;
      oebps?.file(imgName, base64Data, { base64: true });
      manifestItems += `<item id="img${i}" href="${imgName}" media-type="image/png"/>\n`;
    }
  });

  // Table of Contents Page (Visible)
  chapters.forEach((ch, i) => {
    navItems += `<li><a href="chapter_${i}.xhtml">${ch.title}</a></li>\n`;
    tocHtmlItems += `<li><a href="chapter_${i}.xhtml">${ch.title}</a></li>\n`;
  });

  if (params?.includeMetadataPage) {
    navItems += `<li><a href="metadata.xhtml">Metadaten</a></li>\n`;
    tocHtmlItems += `<li><a href="metadata.xhtml">Metadaten</a></li>\n`;
  }

  const tocXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Inhaltsverzeichnis</title>
  <style>
    body { font-family: sans-serif; padding: 5%; }
    h1 { border-bottom: 1px solid #eee; }
    ul { list-style: none; padding: 0; }
    li { margin: 10px 0; }
    a { text-decoration: none; color: #0066cc; }
  </style>
</head>
<body>
  <h1>Inhaltsverzeichnis</h1>
  <ul>
    ${tocHtmlItems}
  </ul>
</body>
</html>`;
  oebps?.file("toc.xhtml", tocXhtml);
  manifestItems += `<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>\n`;
  spineItems += `<itemref idref="toc"/>\n`;

  // Navigation Document (EPUB 3)
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Inhaltsverzeichnis</h1>
    <ol>
      ${navItems}
    </ol>
  </nav>
</body>
</html>`;
  oebps?.file("nav.xhtml", navXhtml);
  manifestItems += `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n`;

  chapters.forEach((ch, i) => {
    const fileName = `chapter_${i}.xhtml`;
    const htmlContent = mdToHtml(ch.content);
    const imgHtml = ch.imageUrl ? `<div style="text-align:center;margin:2em 0;"><img src="chapter_img_${i}.png" style="max-width:100%;height:auto;border-radius:8px;" /></div>` : "";
    
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
  ${imgHtml}
  <div class="content">
    <p>${htmlContent}</p>
  </div>
</body>
</html>`;
    oebps?.file(fileName, xhtml);
    manifestItems += `<item id="ch${i}" href="${fileName}" media-type="application/xhtml+xml"/>\n`;
    spineItems += `<itemref idref="ch${i}"/>\n`;
  });

  // Metadata Page in EPUB
  if (params?.includeMetadataPage) {
    const metadataXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Metadaten zur Erstellung</title>
  <style>
    body { font-family: sans-serif; line-height: 1.6; padding: 5%; }
    h1 { color: #333; border-bottom: 1px solid #eee; }
    ul { list-style: none; padding: 0; }
    li { margin: 5px 0; }
    .label { font-weight: bold; color: #666; }
  </style>
</head>
<body>
  <h1>Metadaten zur Erstellung</h1>
  <p><span class="label">Buchtitel:</span> ${title}</p>
  <p><span class="label">Erstellungsdatum:</span> ${new Date().toLocaleDateString('de-DE')}</p>
  <p><span class="label">Text-Modell:</span> ${params.preferredModel}</p>
  <p><span class="label">Bild-Modell:</span> ${params.imageModel}</p>
  <p><span class="label">Gesamt-Wortzahl:</span> ${metadata?.totalWordsGenerated || 'Unbekannt'}</p>
  <p><span class="label">Anzahl der KI-Anfragen:</span> ${metadata?.totalRequests || 'Unbekannt'}</p>
  
  <h2>Verwendete Parameter:</h2>
  <ul>
    <li><span class="label">Zielgruppe:</span> ${params.targetAudience}</li>
    <li><span class="label">Erzählperspektive:</span> ${params.narrativePerspective}</li>
    <li><span class="label">Sprachstil:</span> ${params.languageStyle}</li>
    <li><span class="label">Lokalisierung:</span> ${params.localization}</li>
    <li><span class="label">Struktur:</span> ${params.structureType}</li>
    <li><span class="label">Persona:</span> ${params.persona}</li>
    <li><span class="label">Interaktivität:</span> Stufe ${params.interactivity} von 4</li>
    <li><span class="label">Zusatzmaterialien:</span> ${[
      params.generateWorksheets ? "Arbeitsblätter" : "",
      params.generateCheatSheet ? "Spickzettel" : "",
      params.generateActionPlan ? "Aktionsplan" : "",
      params.generateChapterImages ? "Kapitelbilder" : ""
    ].filter(Boolean).join(", ") || "Keine"}</li>
  </ul>
  
  <p style="margin-top: 2em; font-style: italic; color: #999;">Dieses Buch wurde mit dem AI Book Architect erstellt.</p>
</body>
</html>`;
    oebps?.file("metadata.xhtml", metadataXhtml);
    manifestItems += `<item id="metadata" href="metadata.xhtml" media-type="application/xhtml+xml"/>\n`;
    spineItems += `<itemref idref="metadata"/>\n`;
  }
  
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
