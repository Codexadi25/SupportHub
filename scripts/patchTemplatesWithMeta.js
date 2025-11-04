const mongoose = require('mongoose');
const Category = require('../models/Category');
require('dotenv').config();

async function patchTemplatesWithMeta() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Find all categories
        const categories = await Category.find();
        console.log(`Found ${categories.length} categories`);

        let totalTemplates = 0;
        let updatedTemplates = 0;

        // Process each category
        for (const category of categories) {
            let hasChanges = false;
            
            // Process each template in the category
            for (const template of category.templates) {
                totalTemplates++;
                
                // If template has the old meta structure, migrate it
                if (template.meta && template.meta.createdAt && template.meta.updatedAt) {
                    if (!template.createdAt) {
                        template.createdAt = template.meta.createdAt;
                    }
                    if (!template.updatedAt) {
                        template.updatedAt = template.meta.updatedAt;
                    }
                    // Optionally remove the old meta field
                    template.meta = undefined;
                    hasChanges = true;
                    updatedTemplates++;
                }
                // If template doesn't have createdAt or updatedAt at all, add them
                else if (!template.createdAt || !template.updatedAt) {
                    template.createdAt = category.createdAt || new Date();
                    template.updatedAt = category.updatedAt || new Date();
                    hasChanges = true;
                    updatedTemplates++;
                }
            }
            
            // Save category if changes were made
            if (hasChanges) {
                await category.save();
                console.log(`Updated category: ${category.title}`);
            }
        }

        console.log(`\nMigration complete!`);
        console.log(`Total templates: ${totalTemplates}`);
        console.log(`Updated templates: ${updatedTemplates}`);
        
        // Close connection
        await mongoose.connection.close();
        console.log('Database connection closed');
        
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    }
}

// Run the migration
patchTemplatesWithMeta();

