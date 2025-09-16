require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 15000, // Increased timeout to allow for SSL negotiation
  connectTimeoutMS: 30000,         // Increased connection timeout
  maxPoolSize: 10,                 // Connection pooling
  retryWrites: true,               // Retry writes on failure
  autoSelectFamily: false          // Fix for IPv4/IPv6 selection that causes SSL alert 80
});

let db;

async function connectDB() {
  try {
    await client.connect();
    console.log('✅ MongoDB connected');
    db = client.db('discordBotDB'); // Name your DB
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

// Export a function to get the DB once connected
function getDB() {
  if (!db) throw new Error('Database not connected yet');
  return db;
}

// Helper functions for each collection

// User Times Collection
async function getUserTimes(userId) {
  const collection = getDB().collection('userTimes');
  const result = await collection.findOne({ userId });
  return result || {
    userId,
    totalTime: 0,
    sessions: 0,
    longestSession: 0,
    todayTime: 0,
    lastActive: null
  };
}

async function updateUserTimes(userId, timeData) {
  const collection = getDB().collection('userTimes');
  await collection.replaceOne({ userId }, { userId, ...timeData }, { upsert: true });
}

// Atomic increment function for user times to prevent data loss from concurrent updates
async function incrementUserTimes(userId, sessionMs) {
  const collection = getDB().collection('userTimes');
  const now = Date.now();
  await collection.updateOne(
    { userId }, 
    { 
      $inc: { totalTime: sessionMs, sessions: 1, todayTime: sessionMs },
      $max: { longestSession: sessionMs },
      $set: { lastActive: now }
    }, 
    { upsert: true }
  );
}

// Faction Times Collection
async function getFactionTimes() {
  const collection = getDB().collection('factionTimes');
  const results = await collection.find({}).toArray();
  const factionTimes = {
    Laughing_Meeks: 0,
    Unicorn_Rapists: 0,
    Special_Activities_Directive: 0
  };
  
  results.forEach(doc => {
    if (factionTimes.hasOwnProperty(doc.faction)) {
      factionTimes[doc.faction] = doc.totalTime;
    }
  });
  
  return factionTimes;
}

async function updateFactionTime(faction, totalTime) {
  const collection = getDB().collection('factionTimes');
  await collection.replaceOne({ faction }, { faction, totalTime }, { upsert: true });
}

// Atomic increment function for faction times to prevent data loss from concurrent updates
async function incrementFactionTime(factionKey, sessionMs) {
  const collection = getDB().collection('factionTimes');
  await collection.updateOne(
    { faction: factionKey }, 
    { $inc: { totalTime: sessionMs } }, 
    { upsert: true }
  );
}

// User Warnings Collection
async function getUserWarnings(userId) {
  const collection = getDB().collection('warnings');
  const result = await collection.findOne({ userId });
  return result?.warnings || [];
}

async function addUserWarning(userId, warning) {
  const collection = getDB().collection('warnings');
  await collection.updateOne(
    { userId }, 
    { $push: { warnings: warning } }, 
    { upsert: true }
  );
}

// User Achievements Collection
async function getUserAchievements(userId) {
  const collection = getDB().collection('achievements');
  const result = await collection.findOne({ userId });
  return result || {
    userId,
    unlocked: [],
    totalPoints: 0,
    progress: {}
  };
}

async function updateUserAchievements(userId, achievementData) {
  const collection = getDB().collection('achievements');
  await collection.replaceOne({ userId }, { userId, ...achievementData }, { upsert: true });
}

// Bot Admins Collection - Updated to support both users and roles
async function getBotAdmins() {
  const collection = getDB().collection('botAdmins');
  const result = await collection.findOne({ _id: 'admins' });
  return result || {
    adminIds: [], // Legacy user IDs
    adminUsers: [], // User IDs
    adminRoles: [] // Role IDs
  };
}

async function setBotAdmins(adminData) {
  const collection = getDB().collection('botAdmins');
  await collection.replaceOne({ _id: 'admins' }, { _id: 'admins', ...adminData }, { upsert: true });
}

async function addBotAdmin(userId) {
  const currentAdmins = await getBotAdmins();
  // Support legacy adminIds and new adminUsers
  const userList = currentAdmins.adminUsers || currentAdmins.adminIds || [];
  if (!userList.includes(userId)) {
    userList.push(userId);
    const updatedAdmins = {
      ...currentAdmins,
      adminUsers: userList,
      adminRoles: currentAdmins.adminRoles || []
    };
    delete updatedAdmins.adminIds; // Remove legacy field
    await setBotAdmins(updatedAdmins);
  }
}

async function removeBotAdmin(userId) {
  const currentAdmins = await getBotAdmins();
  const userList = currentAdmins.adminUsers || currentAdmins.adminIds || [];
  const updatedUserList = userList.filter(id => id !== userId);
  const updatedAdmins = {
    ...currentAdmins,
    adminUsers: updatedUserList,
    adminRoles: currentAdmins.adminRoles || []
  };
  delete updatedAdmins.adminIds; // Remove legacy field
  await setBotAdmins(updatedAdmins);
}

async function addBotAdminRole(roleId) {
  const currentAdmins = await getBotAdmins();
  const roleList = currentAdmins.adminRoles || [];
  if (!roleList.includes(roleId)) {
    roleList.push(roleId);
    const updatedAdmins = {
      ...currentAdmins,
      adminUsers: currentAdmins.adminUsers || currentAdmins.adminIds || [],
      adminRoles: roleList
    };
    delete updatedAdmins.adminIds; // Remove legacy field
    await setBotAdmins(updatedAdmins);
  }
}

async function removeBotAdminRole(roleId) {
  const currentAdmins = await getBotAdmins();
  const roleList = currentAdmins.adminRoles || [];
  const updatedRoleList = roleList.filter(id => id !== roleId);
  const updatedAdmins = {
    ...currentAdmins,
    adminUsers: currentAdmins.adminUsers || currentAdmins.adminIds || [],
    adminRoles: updatedRoleList
  };
  delete updatedAdmins.adminIds; // Remove legacy field
  await setBotAdmins(updatedAdmins);
}

// Guild Settings Collection
async function getGuildSettings(guildId) {
  const collection = getDB().collection('guildSettings');
  const result = await collection.findOne({ guildId });
  return result || {
    guildId,
    factionsEnabled: true,
    clockInChannelId: null,
    notificationChannelId: null,
    welcomeChannelId: null,
    warnChannelId: null
  };
}

async function updateGuildSettings(guildId, settings) {
  const collection = getDB().collection('guildSettings');
  await collection.replaceOne({ guildId }, { guildId, ...settings }, { upsert: true });
}

// Sticky Messages Collection
async function getStickyMessages() {
  const collection = getDB().collection('stickyMessages');
  const results = await collection.find({}).toArray();
  const stickyMessages = {};
  results.forEach(doc => {
    stickyMessages[doc.channelId] = {
      messageId: doc.messageId,
      content: doc.content,
      style: doc.style,
      author: doc.author,
      createdAt: doc.createdAt,
      lastReposted: doc.lastReposted
    };
  });
  return stickyMessages;
}

async function setStickyMessage(channelId, messageData) {
  const collection = getDB().collection('stickyMessages');
  await collection.replaceOne({ channelId }, { channelId, ...messageData }, { upsert: true });
}

async function getStickyMessage(channelId) {
  const collection = getDB().collection('stickyMessages');
  const result = await collection.findOne({ channelId });
  return result ? {
    messageId: result.messageId,
    content: result.content,
    style: result.style,
    author: result.author,
    createdAt: result.createdAt,
    lastReposted: result.lastReposted
  } : null;
}

async function removeStickyMessage(channelId) {
  const collection = getDB().collection('stickyMessages');
  await collection.deleteOne({ channelId });
}

// Pending Requests Collection
async function getPendingRequests() {
  const collection = getDB().collection('pendingRequests');
  const results = await collection.find({}).toArray();
  const pendingRequests = {};
  results.forEach(doc => {
    pendingRequests[doc.userId] = doc.faction;
  });
  return pendingRequests;
}

async function setPendingRequest(userId, faction) {
  const collection = getDB().collection('pendingRequests');
  await collection.replaceOne({ userId }, { userId, faction }, { upsert: true });
}

async function removePendingRequest(userId) {
  const collection = getDB().collection('pendingRequests');
  await collection.deleteOne({ userId });
}

// Faction Points Collection
async function getFactionPoints() {
  const collection = getDB().collection('factionPoints');
  const results = await collection.find({}).toArray();
  const factionPoints = {
    "Laughing_Meeks": { points: 0, victories: 0, activities: 0 },
    "Unicorn_Rapists": { points: 0, victories: 0, activities: 0 },
    "Special_Activities_Directive": { points: 0, victories: 0, activities: 0 }
  };
  
  results.forEach(doc => {
    if (factionPoints.hasOwnProperty(doc.faction)) {
      factionPoints[doc.faction] = {
        points: doc.points || 0,
        victories: doc.victories || 0,
        activities: doc.activities || 0
      };
    }
  });
  
  return factionPoints;
}

async function updateFactionPoints(faction, pointsData) {
  const collection = getDB().collection('factionPoints');
  await collection.replaceOne({ faction }, { faction, ...pointsData }, { upsert: true });
}

async function incrementFactionPoints(faction, pointsToAdd, victoriesAdd = 0, activitiesAdd = 0) {
  const collection = getDB().collection('factionPoints');
  await collection.updateOne(
    { faction }, 
    { 
      $inc: { 
        points: pointsToAdd, 
        victories: victoriesAdd,
        activities: activitiesAdd
      } 
    }, 
    { upsert: true }
  );
}

// Faction Missions Collection
async function getFactionMissions() {
  const collection = getDB().collection('factionMissions');
  const results = await collection.find({}).toArray();
  const factionMissions = {
    "Laughing_Meeks": [],
    "Unicorn_Rapists": [],
    "Special_Activities_Directive": []
  };
  
  results.forEach(doc => {
    if (factionMissions.hasOwnProperty(doc.faction)) {
      factionMissions[doc.faction] = doc.missions || [];
    }
  });
  
  return factionMissions;
}

async function setFactionMissions(faction, missions) {
  const collection = getDB().collection('factionMissions');
  await collection.replaceOne({ faction }, { faction, missions }, { upsert: true });
}

async function addFactionMission(faction, mission) {
  const collection = getDB().collection('factionMissions');
  await collection.updateOne(
    { faction }, 
    { $push: { missions: mission } }, 
    { upsert: true }
  );
}

async function updateFactionMission(faction, missionId, updatedMission) {
  const collection = getDB().collection('factionMissions');
  await collection.updateOne(
    { faction, "missions.id": missionId },
    { $set: { "missions.$": { ...updatedMission, id: missionId } } }
  );
}

// More efficient targeted getters
async function getFactionMissionsByFaction(faction) {
  const collection = getDB().collection('factionMissions');
  const result = await collection.findOne({ faction });
  return result?.missions || [];
}

async function getFactionPointsByFaction(faction) {
  const collection = getDB().collection('factionPoints');
  const result = await collection.findOne({ faction });
  return result ? {
    points: result.points || 0,
    victories: result.victories || 0,
    activities: result.activities || 0
  } : { points: 0, victories: 0, activities: 0 };
}

// Faction Leaders Collection
async function getFactionLeaders() {
  const collection = getDB().collection('factionLeaders');
  const result = await collection.findOne({ _id: 'leaders' });
  return result?.leaders || {
    Laughing_Meeks: "1406779732275499098",
    Unicorn_Rapists: "1406779912441823303",
    Special_Activities_Directive: "1409081159811334204"
  };
}

async function setFactionLeaders(leaders) {
  const collection = getDB().collection('factionLeaders');
  await collection.replaceOne({ _id: 'leaders' }, { _id: 'leaders', leaders }, { upsert: true });
}

// Faction Quotes Collection
async function getFactionQuotes() {
  const collection = getDB().collection('factionQuotes');
  const results = await collection.find({}).toArray();
  const factionQuotes = {
    "Laughing_Meeks": [],
    "Unicorn_Rapists": [],
    "Special_Activities_Directive": []
  };
  
  results.forEach(doc => {
    if (factionQuotes.hasOwnProperty(doc.faction)) {
      factionQuotes[doc.faction] = doc.quotes || [];
    }
  });
  
  return factionQuotes;
}

async function setFactionQuotes(faction, quotes) {
  const collection = getDB().collection('factionQuotes');
  await collection.replaceOne({ faction }, { faction, quotes }, { upsert: true });
}

async function addFactionQuote(faction, quote) {
  const collection = getDB().collection('factionQuotes');
  await collection.updateOne(
    { faction }, 
    { $push: { quotes: quote } }, 
    { upsert: true }
  );
}

// Battle Data Collection
async function getBattleData(battleId) {
  const collection = getDB().collection('battleData');
  const result = await collection.findOne({ battleId });
  return result || null;
}

async function setBattleData(battleId, battleData) {
  const collection = getDB().collection('battleData');
  await collection.replaceOne({ battleId }, { battleId, ...battleData }, { upsert: true });
}

async function removeBattleData(battleId) {
  const collection = getDB().collection('battleData');
  await collection.deleteOne({ battleId });
}

async function getActiveBattles() {
  const collection = getDB().collection('activeBattles');
  const results = await collection.find({}).toArray();
  const activeBattles = new Set();
  results.forEach(doc => {
    activeBattles.add(doc.battleKey);
  });
  return activeBattles;
}

async function addActiveBattle(battleKey) {
  const collection = getDB().collection('activeBattles');
  await collection.insertOne({ battleKey });
}

async function removeActiveBattle(battleKey) {
  const collection = getDB().collection('activeBattles');
  await collection.deleteOne({ battleKey });
}

async function updateBattleParticipants(battleId, faction, userId) {
  const collection = getDB().collection('battleData');
  await collection.updateOne(
    { battleId },
    { $addToSet: { [`participants.${faction}`]: userId } }
  );
}

// Calendar Events Collection
async function getCalendarEvents(guildId) {
  const collection = getDB().collection('calendarEvents');
  const results = await collection.find({ guildId }).toArray();
  return results;
}

async function addCalendarEvent(guildId, eventData) {
  const collection = getDB().collection('calendarEvents');
  const event = {
    guildId,
    id: Date.now().toString(), // Simple ID generation
    ...eventData,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await collection.insertOne(event);
  return event;
}

async function updateCalendarEvent(guildId, eventId, eventData) {
  const collection = getDB().collection('calendarEvents');
  await collection.updateOne(
    { guildId, id: eventId },
    { $set: { ...eventData, updatedAt: Date.now() } }
  );
}

async function removeCalendarEvent(guildId, eventId) {
  const collection = getDB().collection('calendarEvents');
  await collection.deleteOne({ guildId, id: eventId });
}

async function getCalendarEventsByWeek(guildId, weekStart) {
  const collection = getDB().collection('calendarEvents');
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  const results = await collection.find({
    guildId,
    date: {
      $gte: weekStart.toISOString().split('T')[0],
      $lte: weekEnd.toISOString().split('T')[0]
    }
  }).toArray();
  
  return results;
}

// Calendar Settings Collection
async function getCalendarSettings(guildId) {
  const collection = getDB().collection('calendarSettings');
  const result = await collection.findOne({ guildId });
  return result || {
    guildId,
    calendarChannelId: null,
    calendarMessageId: null,
    guildTimezone: 'UTC', // Default guild timezone
    lastUpdated: null
  };
}

async function updateCalendarSettings(guildId, settings) {
  const collection = getDB().collection('calendarSettings');
  await collection.replaceOne({ guildId }, { guildId, ...settings }, { upsert: true });
}

// User Timezones Collection
async function getUserTimezone(userId) {
  const collection = getDB().collection('userTimezones');
  const result = await collection.findOne({ userId });
  return result ? result.timezone : 'UTC'; // Default to UTC if not set
}

async function setUserTimezone(userId, timezone) {
  const collection = getDB().collection('userTimezones');
  await collection.replaceOne(
    { userId }, 
    { userId, timezone, updatedAt: Date.now() }, 
    { upsert: true }
  );
}

// Guild Timezone Functions
async function getGuildTimezone(guildId) {
  const calendarSettings = await getCalendarSettings(guildId);
  return calendarSettings.guildTimezone || 'UTC';
}

async function setGuildTimezone(guildId, timezone) {
  const currentSettings = await getCalendarSettings(guildId);
  const updatedSettings = {
    ...currentSettings,
    guildTimezone: timezone,
    lastUpdated: Date.now()
  };
  await updateCalendarSettings(guildId, updatedSettings);
}

// Priority Tracker Collection
async function getPrioritySettings(guildId) {
  const collection = getDB().collection('prioritySettings');
  const result = await collection.findOne({ guildId });
  return result || {
    guildId,
    trackerChannelId: null,
    trackerMessageId: null,
    priorityActive: false,
    cooldownActive: false,
    cooldownEndTime: null,
    cooldownDuration: 3600000, // 1 hour in milliseconds
    lastUpdated: null
  };
}

async function updatePrioritySettings(guildId, settings) {
  const collection = getDB().collection('prioritySettings');
  await collection.replaceOne({ guildId }, { guildId, ...settings }, { upsert: true });
}

async function setPriorityCooldown(guildId, duration) {
  const currentSettings = await getPrioritySettings(guildId);
  const endTime = Date.now() + duration;
  const updatedSettings = {
    ...currentSettings,
    cooldownActive: true,
    cooldownEndTime: endTime,
    cooldownDuration: duration,
    lastUpdated: Date.now()
  };
  await updatePrioritySettings(guildId, updatedSettings);
  return endTime;
}

async function clearPriorityCooldown(guildId) {
  const currentSettings = await getPrioritySettings(guildId);
  const updatedSettings = {
    ...currentSettings,
    cooldownActive: false,
    cooldownEndTime: null,
    lastUpdated: Date.now()
  };
  await updatePrioritySettings(guildId, updatedSettings);
}

module.exports = {
  connectDB,
  getDB,
  client,
  // User Times
  getUserTimes,
  updateUserTimes,
  incrementUserTimes,
  // Faction Times  
  getFactionTimes,
  updateFactionTime,
  incrementFactionTime,
  // User Warnings
  getUserWarnings,
  addUserWarning,
  // User Achievements
  getUserAchievements,
  updateUserAchievements,
  // Bot Admins
  getBotAdmins,
  setBotAdmins,
  addBotAdmin,
  removeBotAdmin,
  addBotAdminRole,
  removeBotAdminRole,
  // Guild Settings
  getGuildSettings,
  updateGuildSettings,
  // Sticky Messages
  getStickyMessages,
  getStickyMessage,
  setStickyMessage,
  removeStickyMessage,
  // Pending Requests
  getPendingRequests,
  setPendingRequest,
  removePendingRequest,
  // Faction Points
  getFactionPoints,
  updateFactionPoints,
  incrementFactionPoints,
  // Faction Missions
  getFactionMissions,
  setFactionMissions,
  addFactionMission,
  updateFactionMission,
  getFactionMissionsByFaction,
  getFactionPointsByFaction,
  // Faction Leaders
  getFactionLeaders,
  setFactionLeaders,
  // Faction Quotes
  getFactionQuotes,
  setFactionQuotes,
  addFactionQuote,
  // Battle Data
  getBattleData,
  setBattleData,
  removeBattleData,
  getActiveBattles,
  addActiveBattle,
  removeActiveBattle,
  updateBattleParticipants,
  // Calendar Events
  getCalendarEvents,
  addCalendarEvent,
  updateCalendarEvent,
  removeCalendarEvent,
  getCalendarEventsByWeek,
  // Calendar Settings
  getCalendarSettings,
  updateCalendarSettings,
  // User Timezones
  getUserTimezone,
  setUserTimezone,
  // Guild Timezones
  getGuildTimezone,
  setGuildTimezone,
  // Priority Tracker
  getPrioritySettings,
  updatePrioritySettings,
  setPriorityCooldown,
  clearPriorityCooldown
};
