const User = require('../models/User');
const Team = require('../models/Team');
const PerformanceRecord = require('../models/PerformanceRecord');

const MOCK_NAMES = [
    { name: 'Rahul Kumar', id: 'EMP001' },
    { name: 'Sunita Patel', id: 'EMP002' },
    { name: 'Priya Singh', id: 'EMP003' },
    { name: 'Arjun Mehta', id: 'EMP004' },
    { name: 'Amit Sharma', id: 'EMP005' },
    { name: 'Neha Gupta', id: 'EMP006' },
    { name: 'Vikram Singh', id: 'EMP007' },
    { name: 'Siddharth Roy', id: 'EMP008' },
    { name: 'Anjali Verma', id: 'EMP009' },
    { name: 'Karan Johar', id: 'EMP010' }
];

const ERROR_CATEGORIES = ['Data Entry', 'Wrong Category', 'Missed Follow-up', 'Incorrect Policy Applied', 'Spelling/Grammar'];
const BEHAVIOR_TYPES = ['Late back from break', 'Unprofessional tone', 'Mobile phone usage on floor', 'Silent in huddle'];

async function seedDemoData(org, uploadedByUserId) {
    // 1. Create or Find Mock Team
    let team = await Team.findOne({ name: 'Demo Team Alpha', organization: org });
    if (!team) {
        team = await Team.create({
            name: 'Demo Team Alpha',
            organization: org,
            department: 'support',
            isActive: true,
            shiftPolicy: {
                defaultShift: 'morning',
                lateLoginThresholdMins: 10,
                earlyLogoutThresholdMins: 10,
                maxBreakMinsPerShift: 60,
                workingHoursPerDay: 9
            }
        });
    }

    // 2. Create or Find Mock Users
    const seededUserIds = [];
    const users = [];

    for (const item of MOCK_NAMES) {
        const username = `demo_${item.name.toLowerCase().replace(/\s+/g, '_')}`;
        let user = await User.findOne({ username, organization: org });
        
        if (!user) {
            // Create user
            user = await User.create({
                username,
                password: 'demoPassword123!', // Required field in schema
                role: 'user',
                department: 'support',
                organization: org,
                teamId: team._id,
                displayName: item.name,
                profileName: item.name,
                employeeId: item.id,
                shiftType: 'morning',
                isActive: true
            });
        } else {
            // Ensure team assignment matches
            user.teamId = team._id;
            await user.save();
        }
        users.push(user);
        seededUserIds.push(user._id);
    }

    // Assign members to team
    team.members = seededUserIds;
    await team.save();

    // 3. Delete existing records for these users
    await PerformanceRecord.deleteMany({ userId: { $in: seededUserIds }, organization: org });

    // 4. Generate last 30 days of records
    const records = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();

    for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOffset);
        const dayName = daysOfWeek[date.getDay()];
        const isWeekend = dayName === 'Sat' || dayName === 'Sun';

        for (const user of users) {
            const record = {
                userId: user._id,
                employeeId: user.employeeId,
                agentName: user.displayName,
                organization: org,
                department: 'support',
                teamId: team._id,
                date: new Date(date.setHours(12, 0, 0, 0)), // mid-day to avoid TZ boundary issues
                weekDay: dayName === 'Sun' ? 'Sun' : dayName === 'Mon' ? 'Mon' : dayName === 'Tue' ? 'Tue' : dayName === 'Wed' ? 'Wed' : dayName === 'Thu' ? 'Thu' : dayName === 'Fri' ? 'Fri' : 'Sat',
                shiftType: 'morning',
                shiftStart: '09:00',
                shiftEnd: '18:00',
                uploadedBy: uploadedByUserId || null,
                dataSource: 'csv'
            };

            if (isWeekend) {
                // Weekend Off
                record.status = 'week_off';
                record.isWeekOff = true;
                record.weekOffDay = dayName;
            } else {
                // Weekday - decide status
                const rand = Math.random();
                if (rand < 0.88) {
                    // Present
                    record.status = 'present';
                    
                    const isLate = Math.random() < 0.15;
                    const lateMins = isLate ? Math.floor(Math.random() * 30) + 5 : 0;
                    const isEarlyOut = Math.random() < 0.08;
                    const earlyMins = isEarlyOut ? Math.floor(Math.random() * 20) + 5 : 0;
                    
                    // Format times
                    let loginHour = 9;
                    let loginMin = 0 + lateMins;
                    if (loginMin >= 60) {
                        loginHour += 1;
                        loginMin -= 60;
                    }
                    record.loginTime = `${String(loginHour).padStart(2,'0')}:${String(loginMin).padStart(2,'0')}`;

                    let logoutHour = 18;
                    let logoutMin = 0 - earlyMins;
                    if (logoutMin < 0) {
                        logoutHour -= 1;
                        logoutMin += 60;
                    }
                    record.logoutTime = `${String(logoutHour).padStart(2,'0')}:${String(logoutMin).padStart(2,'0')}`;

                    const workedMins = (18 * 60) - earlyMins - (9 * 60 + lateMins);
                    record.loginHrs = parseFloat((workedMins / 60).toFixed(2));
                    record.lateLoginMins = lateMins;
                    record.earlyLogoutMins = earlyMins;
                    record.isLateLogin = isLate;
                    record.isEarlyLogout = isEarlyOut;

                    // Performance KPIs
                    record.ticketsProcessed = Math.floor(Math.random() * 25) + 35; // 35 - 60 tickets
                    record.aht = parseFloat((Math.random() * 5 + 6.5).toFixed(1)); // 6.5 - 11.5 minutes
                    record.qualityScore = Math.floor(Math.random() * 20) + 80; // 80 - 100
                    record.csat = parseFloat((Math.random() * 1.5 + 3.5).toFixed(1)); // 3.5 - 5.0
                    record.fcr = Math.floor(Math.random() * 20) + 75; // 75% - 95%
                    record.escalations = Math.random() < 0.15 ? Math.floor(Math.random() * 3) + 1 : 0;
                    record.transferred = Math.floor(Math.random() * 4);

                    // Composite Performance Score
                    // Normalise CSAT to 100%, tickets relative to target 50
                    const normCsat = (record.csat / 5) * 100;
                    const normTickets = Math.min(100, (record.ticketsProcessed / 50) * 100);
                    record.performanceScore = Math.round(
                        (record.qualityScore * 0.4) + 
                        (record.fcr * 0.2) + 
                        (normCsat * 0.2) + 
                        (normTickets * 0.2)
                    );

                    // Breaks (total break mins around 45-65 mins)
                    const totalBreaks = Math.floor(Math.random() * 15) + 48;
                    record.totalBreakMins = totalBreaks;
                    record.breaks = [
                        { startTime: '11:00', endTime: '11:15', durationMins: 15, hour: 2, type: 'short' },
                        { startTime: '13:30', endTime: '14:00', durationMins: 30, hour: 4, type: 'lunch' },
                        { startTime: '16:00', endTime: `16:${String(15 + (totalBreaks - 60)).padStart(2,'0')}`, durationMins: totalBreaks - 45, hour: 7, type: 'short' }
                    ];

                    // Behavior issue (rare)
                    if (Math.random() < 0.04) {
                        record.behaviorIssues = [{
                            type: BEHAVIOR_TYPES[Math.floor(Math.random() * BEHAVIOR_TYPES.length)],
                            severity: Math.random() < 0.2 ? 'medium' : 'low',
                            note: 'Observed during floor walk.'
                        }];
                    }

                    // Error patterns (occasional)
                    if (Math.random() < 0.10) {
                        record.errors = [{
                            category: ERROR_CATEGORIES[Math.floor(Math.random() * ERROR_CATEGORIES.length)],
                            description: 'Incorrect customer detail entry.',
                            count: Math.floor(Math.random() * 2) + 1,
                            suggestion: 'Double check CRM profile before saving.'
                        }];
                    }

                } else if (rand < 0.94) {
                    // Leave
                    record.status = 'leave';
                    record.leaveType = Math.random() < 0.6 ? 'sick' : 'casual';
                    record.loginHrs = 0;
                    record.ticketsProcessed = 0;
                    record.aht = 0;
                    record.qualityScore = 0;
                    record.performanceScore = 0;
                } else if (rand < 0.98) {
                    // Training
                    record.status = 'training';
                    record.loginTime = '09:00';
                    record.logoutTime = '18:00';
                    record.loginHrs = 9.0;
                    record.ticketsProcessed = 0;
                    record.aht = 0;
                    record.qualityScore = 0;
                    record.performanceScore = 0;
                } else {
                    // Absent
                    record.status = 'absent';
                    record.loginHrs = 0;
                    record.ticketsProcessed = 0;
                    record.aht = 0;
                    record.qualityScore = 0;
                    record.performanceScore = 0;
                }
            }

            records.push(record);
        }
    }

    await PerformanceRecord.insertMany(records);
    return { success: true, count: records.length, employeeCount: users.length };
}

async function clearDemoData(org) {
    // 1. Find the mock users
    const mockUsers = await User.find({ username: /^demo_/, organization: org }).select('_id');
    const mockUserIds = mockUsers.map(u => u._id);

    // 2. Delete attendance records for these users or employee IDs
    const mockEmpIds = ['EMP001', 'EMP002', 'EMP003', 'EMP004', 'EMP005', 'EMP006', 'EMP007', 'EMP008', 'EMP009', 'EMP010'];
    const recordResult = await PerformanceRecord.deleteMany({ 
        $or: [
            { userId: { $in: mockUserIds } },
            { employeeId: { $in: mockEmpIds } }
        ],
        organization: org 
    });

    // 3. Delete mock users
    const userResult = await User.deleteMany({ _id: { $in: mockUserIds } });

    // 4. Delete mock team
    const teamResult = await Team.deleteMany({ name: 'Demo Team Alpha', organization: org });

    return {
        success: true,
        deletedRecords: recordResult.deletedCount,
        deletedUsers: userResult.deletedCount,
        deletedTeams: teamResult.deletedCount
    };
}

module.exports = {
    seedDemoData,
    clearDemoData
};
