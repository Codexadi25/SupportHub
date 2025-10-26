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
                
                // If template doesn't have meta field, add it
                if (!template.meta || !template.meta.createdAt || !template.meta.updatedAt) {
                    template.meta = {
                        createdAt: category.createdAt || new Date(),
                        updatedAt: category.updatedAt || new Date()
                    };
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

