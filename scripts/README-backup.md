# Database Backup Script

A flexible backup script that allows you to backup your MongoDB database to local storage, cloud storage, or both.

## Features

- **Interactive CLI**: Choose where to store your backup
- **Local Backup**: Save as JSON files in `backups/` folder
- **Cloud Backup**: Copy to a different MongoDB database
- **Both Options**: Backup to both local and cloud simultaneously
- **Safety Warnings**: Confirmation prompts for destructive operations

## Usage

```bash
node scripts/backupDatabase.js
```

## Backup Options

### 1. Local System Only
- Backups are saved as JSON files in `backups/backup-<timestamp>/`
- Each collection is exported separately
- Includes a `backup-info.json` summary file

### 2. Cloud Database Only
- Requires a different MongoDB URI (cloud database)
- **Warning**: Replaces ALL data in the cloud database
- Use for creating remote backups or mirroring production data

### 3. Both Local and Cloud
- Performs both local file backup and cloud database backup
- Confirmation required for cloud backup (destructive operation)

## Example Session

```
Where would you like to save the backup?
1. Local system only
2. Cloud database only (requires different DB URI)
3. Both local and cloud

Enter your choice (1, 2, or 3): 1

📁 Creating local backup at: D:\Lab-1\SupportHub\backups\backup-2025-10-26T12-51-00-192Z

Backing up Categories...
  ✓ Categories: 10 documents
Backing up Users...
  ✓ Users: 13 documents
...

✅ Backup completed successfully!
📁 Local backup: D:\Lab-1\SupportHub\backups\backup-2025-10-26T12-51-00-192Z
📊 Documents backed up: 13459
```

## Backup Files Created

When backing up locally, the following files are created:

```
backups/backup-<timestamp>/
├── backup-info.json         # Summary of the backup
├── categories.json          # All canned responses
├── users.json               # All user accounts
├── feedback.json            # All feedback entries
├── notices.json             # All notices
├── privateNotes.json        # All private notes
├── messages.json            # All messages
└── logs.json                # All system logs
```

## Cloud Backup

When backing up to cloud:

1. Enter the target database URI when prompted
2. All collections are cleared and replaced with source data
3. Uses the same model schemas as the source

**⚠️ Important**: Cloud backup is destructive - it replaces all data in the target database!

## Restoring from Backup

### Local Backup
Use the data files directly with MongoDB import tools or manual restoration scripts.

### Cloud Backup
The cloud backup automatically restores data to the specified database URI.

## Best Practices

1. **Run before major changes**: Always backup before modifying database models
2. **Regular backups**: Set up a cron job for automated backups
3. **Cloud backups**: Use for disaster recovery scenarios
4. **Verify backups**: Check that backup files are created successfully

## Troubleshooting

### Connection Issues
- Verify `MONGO_URI` in `.env` file
- Check network connectivity for cloud backups
- Ensure proper authentication for cloud database

### Large Collections
- Logs can be very large (>13K documents)
- Consider excluding logs for faster backups
- Modify script to add logs backup as optional

## Next Steps After Backup

Once you have a backup:

1. You can safely modify database models
2. Test changes in development
3. Restore if needed using the backup files
4. Run migration scripts like `patchTemplatesWithMeta.js`

