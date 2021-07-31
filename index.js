'use strict';

const nconf = require.main.require('nconf');
const winston = require.main.require('winston');

const db = require.main.require('./src/database');
const User = require.main.require('./src/user');
const Messaging = require.main.require('./src/messaging');
const PluginSockets = require.main.require('./src/socket.io/plugins');
const pubsub = require.main.require('./src/pubsub');

const ROOM_KEY = 'plugin-global-chat:roomId';

/**
 * Set of users ignoring the global chat
 */
const USERS_IGNORING_KEY = 'plugin-global-chat:ignoring';

let roomId = null;

/**
 * Creates a new Global Chat room.
 * @param {number[]} uids
 * @param {number} oldGlobalRoomId
 * @returns {Promise<number>} newRoomId
 */
async function createGlobalRoom(uids, oldGlobalRoomId) {
	const now = Date.now();

	const newRoomId = oldGlobalRoomId || await db.incrObjectField('global', 'nextChatRoomId');
	const room = {
		roomId: newRoomId,
		groupChat: 1,
		roomName: '[[plugin-global-chat:global-chat]]',
	};
	await db.setObject(`chat:room:${newRoomId}`, room);
	await db.sortedSetAdd(`chat:room:${newRoomId}:uids`, uids.map(() => now), uids);
	await Messaging.addRoomToUsers(newRoomId, uids, now);

	return newRoomId;
}

/**
 * Deletes a Global Chat room
 * @param {number} globalRoomId
 */
async function deleteGlobalRoom(globalRoomId) {
	const uids = await Messaging.getUidsInRoom(globalRoomId, 0, -1);
	await Messaging.leaveRoom(uids, globalRoomId);
	await db.delete(`chat:room:${globalRoomId}`);
}

const updateRoomEvent = 'global-chat:update-roomId';
pubsub.on(updateRoomEvent, (newRoomId) => {
	roomId = newRoomId;
});

exports.init = async function ({ router, middleware }) {
	const renderAdmin = (req, res) => {
		res.render('admin/plugins/global-chat', {});
	};
	router.get('/admin/plugins/global-chat', middleware.admin.buildHeader, renderAdmin);
	router.get('/api/admin/plugins/global-chat', renderAdmin);

	router.post('/api/admin/plugins/global-chat/delete-room',
		(req, res, next) => deleteGlobalRoom(roomId)
			.then(() => res.sendStatus(200))
			.catch(err => next(err)));

	// only run on primary machine
	// let pubsub handle it
	if (!nconf.get('runJobs')) {
		return;
	}

	const currentRoomId = await db.get(ROOM_KEY);
	const originalRoomId = await db.getObjectField(`chat:room:${currentRoomId}`, 'roomId');

	roomId = originalRoomId;
	console.log('roomId', roomId);

	if (roomId) {
		pubsub.publish(updateRoomEvent, roomId);
		return;
	}

	const allUids = await User.getUidsFromSet('users:joindate', 0, -1);
	const newRoomId = await createGlobalRoom(allUids, currentRoomId);

	roomId = newRoomId;
	console.log('roomId', roomId);

	if (!roomId) {
		throw new Error('[global-chat] Failed to create new room');
	}

	await db.set(ROOM_KEY, roomId);
	pubsub.publish(updateRoomEvent, roomId);
};


/**
 * Called on `action:user.create`.
 * Add registered users to global chat.
 */
exports.addUser = async function (data) {
	if (!roomId) {
		return;
	}
	const { uid } = data.user;
	const now = Date.now();

	await Promise.all([
		db.sortedSetAdd(`chat:room:${roomId}:uids`, now, uid),
		Messaging.addRoomToUsers(roomId, [uid], now),
	]).catch(err => winston.error('[plugin-global-chat] Error adding user to global chat', err));
};

/**
 * Called on `filter:config.get`.
 */
exports.addRoomId = async function (config) {
	config.globalChatRoomId = roomId;
	return config;
};

/**
 * Called on `filter:messaging.notify`
 */
exports.shouldNotify = async function (data) {
	if (data.roomId !== roomId) {
		return data;
	}

	const isIgnores = await db.isSetMembers(USERS_IGNORING_KEY, data.uids);
	data.uids = data.uids.filter((uid, i) => !isIgnores[i]);

	return data;
};

/**
 * Called on `filter:admin.header.build`
 */
exports.adminMenu = async function (header) {
	header.plugins.push({
		route: '/plugins/global-chat',
		icon: 'fa-comments',
		name: '[[plugin-global-chat:global-chat]]',
	});
	return header;
};

PluginSockets.globalChat = {
	ignore: async socket => db.setAdd(USERS_IGNORING_KEY, socket.uid),
	watch: async socket => db.setRemove(USERS_IGNORING_KEY, socket.uid),
	isIgnoring: async socket => db.isSetMember(USERS_IGNORING_KEY, socket.uid),
};
