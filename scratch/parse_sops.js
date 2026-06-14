const fs = require('fs');
const path = require('path');

const ejsPath = path.join(__dirname, '..', 'views', 'sop_panel.ejs');
const html = fs.readFileSync(ejsPath, 'utf8');

const categoryBlocks = html.split('<div class="category-block">');
const categories = [];

for (let i = 1; i < categoryBlocks.length; i++) {
    const block = categoryBlocks[i];
    const titleMatch = block.match(/<div class="category-title">([\s\S]*?)<\/div>/);
    if (!titleMatch) continue;
    let fullTitle = titleMatch[1].trim();
    let phase = '';
    const spanMatch = fullTitle.match(/<span>([\s\S]*?)<\/span>/);
    if (spanMatch) {
        phase = spanMatch[1].trim();
        fullTitle = fullTitle.replace(/<span>[\s\S]*?<\/span>/, '').trim();
    }
    
    // Now extract cards
    const cards = [];
    const cardBlocks = block.split('<div class="sop-card"');
    for (let j = 1; j < cardBlocks.length; j++) {
        const cardBlock = cardBlocks[j];
        const tagsMatch = cardBlock.match(/data-tags="([\s\S]*?)"/);
        const tags = tagsMatch ? tagsMatch[1].split(/\s+/).filter(Boolean) : [];
        
        const headerMatch = cardBlock.match(/<div class="card-header">([\s\S]*?)<\/div>/);
        const title = headerMatch ? headerMatch[1].trim() : '';
        
        const condMatch = cardBlock.match(/<div class="card-cond">([\s\S]*?)<\/div>/);
        const condition = condMatch ? condMatch[1].trim() : '';
        
        const actionMatch = cardBlock.match(/<span class="action-tag [\s\S]*?">([\s\S]*?)<\/span>/);
        const action = actionMatch ? actionMatch[1].trim() : '';
        
        const detailMatch = cardBlock.match(/<div class="card-detail-data" style="display:none">([\s\S]*?)<\/div>/);
        const details = detailMatch ? detailMatch[1].trim() : '';
        
        cards.push({
            title,
            condition,
            action,
            tags,
            details
        });
    }
    
    categories.push({
        category: fullTitle,
        phase,
        items: cards
    });
}

// Output as JSON to output.json in scratch
const outputPath = path.join(__dirname, 'sop_data.json');
fs.writeFileSync(outputPath, JSON.stringify(categories, null, 2), 'utf8');
console.log(`Parsed ${categories.length} categories. Data saved to ${outputPath}`);
