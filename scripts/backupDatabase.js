const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

// Models
const Category = require('../models/Category');
const User = require('../models/User');
const Feedback = require('../models/Feedback');
const Notice = require('../models/Notice');
const PrivateNote = require('../models/PrivateNote');
const Message = require('../models/Message');
const Log = require('../models/Log');

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Helper function to ask questions
function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// Backup to local file system
async function backupToLocal(backupDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}`);
    fs.mkdirSync(backupPath);

    console.log(`\n📁 Creating local backup at: ${backupPath}\n`);

    let totalDocuments = 0;

    // Backup Categories
    console.log('Backing up Categories...');
    const categories = await Category.find({}).lean();
    fs.writeFileSync(
        path.join(backupPath, 'categories.json'),
        JSON.stringify(categories, null, 2)
    );
    console.log(`  ✓ Categories: ${categories.length} documents`);
    totalDocuments += categories.length;

    // Backup Users
    console.log('Backing up Users...');
    const users = await User.find({}).lean();
    fs.writeFileSync(
        path.join(backupPath, 'users.json'),
        JSON.stringify(users, null, 2)
    );
    console.log(`  ✓ Users: ${users.length} documents`);
    totalDocuments += users.length;

    // Backup Feedback
    console.log('Backing up Feedback...');
    const feedback = await Feedback.find({}).lean();
    fs.writeFileSync(
        path.join(backupPath, 'feedback.json'),
        JSON.stringify(feedback, null, 2)
    );
    console.log(`  ✓ Feedback: ${feedback.length} documents`);
    totalDocuments += feedback.length;

    // Backup Notices
    console.log('Backing up Notices...');
    const notices = await Notice.find({}).lean();
    fs.writeFileSync(
        path.join(backupPath, 'notices.json'),
        JSON.stringify(notices, null, 2)
    );
    console.log(`  ✓ Notices: ${notices.length} documents`);
    totalDocuments += notices.length;

    // Backup Private Notes
    console.log('Backing up Private Notes...');
    const privateNotes = await PrivateNote.find({}).lean();
    fs.writeFileSync(
        path.join(backupPath, 'privateNotes.json'),
        JSON.stringify(privateNotes, null, 2)
    );
    console.log(`  ✓ Private Notes: ${privateNotes.length} documents`);
    totalDocuments += privateNotes.length;

    // Backup Messages
    console.log('Backing up Messages...');
    const messages = await Message.find({}).lean();
    fs.writeFileSync(
        path.join(backupPath, 'messages.json'),
        JSON.stringify(messages, null, 2)
    );
    console.log(`  ✓ Messages: ${messages.length} documents`);
    totalDocuments += messages.length;

    // Backup Logs (optional - can be large)
    console.log('Backing up Logs...');
    const logs = await Log.find({}).lean();
    fs.writeFileSync(
        path.join(backupPath, 'logs.json'),
        JSON.stringify(logs, null, 2)
    );
    console.log(`  ✓ Logs: ${logs.length} documents`);
    totalDocuments += logs.length;

    // Create a backup info file
    const backupInfo = {
        timestamp: new Date().toISOString(),
        location: 'local',
        totalDocuments: totalDocuments,
        collections: {
            categories: categories.length,
            users: users.length,
            feedback: feedback.length,
            notices: notices.length,
            privateNotes: privateNotes.length,
            messages: messages.length,
            logs: logs.length
        }
    };

    fs.writeFileSync(
        path.join(backupPath, 'backup-info.json'),
        JSON.stringify(backupInfo, null, 2)
    );

    return { backupPath, backupInfo };
}

// Backup to cloud database
async function backupToCloud(cloudURI) {
    console.log(`\n☁️  Connecting to cloud database...`);
    
    let cloudConnection;
    try {
        cloudConnection = await mongoose.createConnection(cloudURI);
        console.log('✓ Connected to cloud database');
    } catch (error) {
        console.error('❌ Failed to connect to cloud database:', error.message);
        return null;
    }

    // Get schemas
    const CategoryModel = require('../models/Category');
    const UserModel = require('../models/User');
    const FeedbackModel = require('../models/Feedback');
    const NoticeModel = require('../models/Notice');
    const PrivateNoteModel = require('../models/PrivateNote');
    const MessageModel = require('../models/Message');
    const LogModel = require('../models/Log');

    const CloudCategory = cloudConnection.model('Category', CategoryModel.schema.obj);
    const CloudUser = cloudConnection.model('User', UserModel.schema.obj);
    const CloudFeedback = cloudConnection.model('Feedback', FeedbackModel.schema.obj);
    const CloudNotice = cloudConnection.model('Notice', NoticeModel.schema.obj);
    const CloudPrivateNote = cloudConnection.model('PrivateNote', PrivateNoteModel.schema.obj);
    const CloudMessage = cloudConnection.model('Message', MessageModel.schema.obj);
    const CloudLog = cloudConnection.model('Log', LogModel.schema.obj);

    console.log('\nStarting cloud backup...\n');

    let totalDocuments = 0;

    // Backup Categories
    console.log('Backing up Categories to cloud...');
    const categories = await Category.find({}).lean();
    await CloudCategory.deleteMany({});
    await CloudCategory.insertMany(categories);
    console.log(`  ✓ Categories: ${categories.length} documents`);
    totalDocuments += categories.length;

    // Backup Users
    console.log('Backing up Users to cloud...');
    const users = await User.find({}).lean();
    await CloudUser.deleteMany({});
    await CloudUser.insertMany(users);
    console.log(`  ✓ Users: ${users.length} documents`);
    totalDocuments += users.length;

    // Backup Feedback
    console.log('Backing up Feedback to cloud...');
    const feedback = await Feedback.find({}).lean();
    await CloudFeedback.deleteMany({});
    await CloudFeedback.insertMany(feedback);
    console.log(`  ✓ Feedback: ${feedback.length} documents`);
    totalDocuments += feedback.length;

    // Backup Notices
    console.log('Backing up Notices to cloud...');
    const notices = await Notice.find({}).lean();
    await CloudNotice.deleteMany({});
    await CloudNotice.insertMany(notices);
    console.log(`  ✓ Notices: ${notices.length} documents`);
    totalDocuments += notices.length;

    // Backup Private Notes
    console.log('Backing up Private Notes to cloud...');
    const privateNotes = await PrivateNote.find({}).lean();
    await CloudPrivateNote.deleteMany({});
    await CloudPrivateNote.insertMany(privateNotes);
    console.log(`  ✓ Private Notes: ${privateNotes.length} documents`);
    totalDocuments += privateNotes.length;

    // Backup Messages
    console.log('Backing up Messages to cloud...');
    const messages = await Message.find({}).lean();
    await CloudMessage.deleteMany({});
    await CloudMessage.insertMany(messages);
    console.log(`  ✓ Messages: ${messages.length} documents`);
    totalDocuments += messages.length;

    // Backup Logs
    console.log('Backing up Logs to cloud...');
    const logs = await Log.find({}).lean();
    await CloudLog.deleteMany({});
    await CloudLog.insertMany(logs);
    console.log(`  ✓ Logs: ${logs.length} documents`);
    totalDocuments += logs.length;

    await cloudConnection.close();
    console.log('\n✓ Cloud backup completed');

    return { totalDocuments };
}

async function backupDatabase() {
    try {
        // Connect to source database
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to source database\n');

        // Ask where to backup
        console.log('Where would you like to save the backup?');
        console.log('1. Local system only');
        console.log('2. Cloud database only (requires different DB URI)');
        console.log('3. Both local and cloud');
        console.log();

        const choice = await askQuestion('Enter your choice (1, 2, or 3): ');
        
        const backupDir = path.join(__dirname, '..', 'backups');
        let result = {};

        switch (choice.trim()) {
            case '1':
                if (!fs.existsSync(backupDir)) {
                    fs.mkdirSync(backupDir, { recursive: true });
                }
                result.local = await backupToLocal(backupDir);
                break;

            case '2':
                console.log('\n⚠️  Warning: This will replace all data in the cloud database!');
                const confirm = await askQuestion('Are you sure? (yes/no): ');
                if (confirm.toLowerCase() !== 'yes') {
                    console.log('Backup cancelled.');
                    process.exit(0);
                }
                const cloudURI = await askQuestion('Enter cloud database URI: ');
                result.cloud = await backupToCloud(cloudURI);
                if (!result.cloud) {
                    console.log('❌ Cloud backup failed. Exiting.');
                    process.exit(1);
                }
                break;

            case '3':
                if (!fs.existsSync(backupDir)) {
                    fs.mkdirSync(backupDir, { recursive: true });
                }
                
                console.log('\n📁 Starting local backup...');
                result.local = await backupToLocal(backupDir);
                
                console.log('\n☁️  Starting cloud backup...');
                console.log('⚠️  Warning: This will replace all data in the cloud database!');
                const confirmBoth = await askQuestion('Are you sure? (yes/no): ');
                if (confirmBoth.toLowerCase() === 'yes') {
                    const cloudURI = await askQuestion('Enter cloud database URI: ');
                    result.cloud = await backupToCloud(cloudURI);
                }
                break;

            default:
                console.log('❌ Invalid choice. Exiting.');
                process.exit(1);
        }

        // Summary
        console.log('\n✅ Backup completed successfully!');
        if (result.local) {
            console.log(`📁 Local backup: ${result.local.backupPath}`);
            console.log(`📊 Documents backed up: ${result.local.backupInfo.totalDocuments}`);
        }
        if (result.cloud) {
            console.log(`☁️  Cloud backup completed`);
            console.log(`📊 Documents backed up: ${result.cloud.totalDocuments}`);
        }

        // Close connection
        await mongoose.connection.close();
        console.log('\nDatabase connection closed');
        
        rl.close();
        
    } catch (error) {
        console.error('\n❌ Backup error:', error);
        rl.close();
        process.exit(1);
    }
}

// Run the backup
backupDatabase();
