const MAX_CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 150;
const MIN_CHUNK_SIZE = 100;

function splitByHeadings(content) {
  const sections = [];
  const lines = content.split('\n');
  let currentSection = { heading: '', headingLevel: 0, lines: [] };
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      currentSection.lines.push(line);
      continue;
    }

    if (!inCodeBlock) {
      const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
      if (headingMatch) {
        if (currentSection.lines.length > 0) {
          sections.push({
            heading: currentSection.heading,
            headingLevel: currentSection.headingLevel,
            text: currentSection.lines.join('\n').trim(),
          });
        }
        currentSection = {
          heading: headingMatch[2].trim(),
          headingLevel: headingMatch[1].length,
          lines: [],
        };
        continue;
      }
    }

    currentSection.lines.push(line);
  }

  if (currentSection.lines.length > 0) {
    sections.push({
      heading: currentSection.heading,
      headingLevel: currentSection.headingLevel,
      text: currentSection.lines.join('\n').trim(),
    });
  }

  return sections;
}

function splitLongSection(section, parentHeading) {
  const chunks = [];
  const text = section.text;

  if (text.length <= MAX_CHUNK_SIZE) {
    const headingLine = section.heading ? `## ${section.heading}` : '';
    const contextHeader = parentHeading ? `${parentHeading} > ` : '';
    const fullHeading = contextHeader + headingLine;

    if (text.length >= MIN_CHUNK_SIZE) {
      chunks.push({
        heading: fullHeading || section.heading || 'Untitled',
        content: text,
      });
    }
    return chunks;
  }

  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  let currentHeading = section.heading || '';

  for (const para of paragraphs) {
    const paraTrimmed = para.trim();
    if (!paraTrimmed) continue;

    if (currentChunk && currentChunk.length + paraTrimmed.length > MAX_CHUNK_SIZE) {
      if (currentChunk.length >= MIN_CHUNK_SIZE) {
        chunks.push({
          heading: currentHeading,
          content: currentChunk.trim(),
        });
      }

      const overlapText = currentChunk.slice(-CHUNK_OVERLAP);
      const overlapLines = overlapText.split('\n').slice(-3).join('\n');
      currentChunk = overlapLines ? overlapLines + '\n\n' + paraTrimmed : paraTrimmed;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + paraTrimmed : paraTrimmed;
    }
  }

  if (currentChunk.length >= MIN_CHUNK_SIZE) {
    chunks.push({
      heading: currentHeading,
      content: currentChunk.trim(),
    });
  }

  return chunks;
}

function chunkDocument(doc) {
  const chunks = [];
  const sections = splitByHeadings(doc.content);
  const parentHeadings = [];
  let chunkIndex = 0;

  for (const section of sections) {
    while (
      parentHeadings.length > 0 &&
      parentHeadings[parentHeadings.length - 1].level >= section.headingLevel
    ) {
      parentHeadings.pop();
    }

    if (section.heading && section.headingLevel > 0) {
      parentHeadings.push({ text: section.heading, level: section.headingLevel });
    }

    const parentContext = parentHeadings
      .slice(0, -1)
      .map((h) => h.text)
      .join(' > ');

    const sectionChunks = splitLongSection(section, parentContext || null);

    for (const chunk of sectionChunks) {
      const headingPath = parentContext
        ? `${parentContext} > ${chunk.heading}`
        : chunk.heading || doc.title;

      chunks.push({
        id: `${doc.path}#${chunkIndex}`,
        docPath: doc.path,
        docCategory: doc.category,
        docTitle: doc.title,
        docTopic: doc.topic,
        docDate: doc.date,
        docPhase: doc.phase,
        docGoal: doc.goal,
        docTechStack: doc.techStack,
        docTags: doc.tags,
        headingPath,
        content: chunk.content,
        index: chunkIndex,
      });

      chunkIndex++;
    }
  }

  return chunks;
}

export { chunkDocument };
