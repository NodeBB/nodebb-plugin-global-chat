'use strict';

const {
  parallel,
  waterfall,
  filter,
} = require('async');

const nconf = require.main.require('nconf');
const winston = require.main.require('winston');

const db = require.main.require('./src/database');
const User = require.main.require('./src/user');
const Messaging = require.main.require('./src/messaging');
const PluginSockets = require.main.require('./src/socket.io/plugins');
const pubsub = require.main.require('./src/pubsub');

const roomKey = 'plugin-global-chat:roomId';
// set of users ignoring the global chat
const usersIgnoringKey = 'plugin-global-chat:ignoring';

let roomId = null;

// because the functionality doesn't exist in core
function newRoom(uids, oldRoomId, callback) {
  let newRoomId;
  const now = Date.now();
  waterfall([
    (next) => {
      if (oldRoomId != null) {
        next(null, oldRoomId);
        return;
      }

      db.incrObjectField('global', 'nextChatRoomId', next);
    },
    (createdRoomId, next) => {
      newRoomId = createdRoomId;
      const room = {
        roomId: newRoomId,
        groupChat: 1,
        roomName: 'Global Chat',
      };
      db.setObject(`chat:room:${newRoomId}`, room, next);
    },
    next => db.sortedSetAdd(`chat:room:${newRoomId}:uids`, uids.map(() => now), uids, next),
    next => Messaging.addRoomToUsers(newRoomId, uids, now, next),
    next => next(null, newRoomId),
  ], callback);
}

function deleteRoom(callback) {
  waterfall([
    // get all uids
    next => User.getUidsFromSet('users:joindate', 0, -1, next),
    // remove all users from room
    (uids, next) => Messaging.leaveRoom(uids, roomId, err => next(err)),
    // delete room
    next => db.delete(`chat:room:${roomId}`, next),
  ], err => callback(err));
}

const renderAdmin = (req, res) => {
  res.render('admin/plugins/global-chat', {});
};

const updateRoomEvent = 'global-chat:update-roomId';
pubsub.on(updateRoomEvent, (newRoomId) => {
  roomId = newRoomId;
});

exports.init = ({ router, middleware }, callback) => {
  router.get('/admin/plugins/global-chat', middleware.admin.buildHeader, renderAdmin);
  router.get('/api/admin/plugins/global-chat', renderAdmin);

  router.post('/api/admin/plugins/global-chat/delete-room', (req, res, next) => {
    deleteRoom((err) => {
      if (err) {
        next(err);
        return;
      }

      res.sendStatus(200);
    });
  });

  // only run on primary machine
  // let pubsub handle it
  if (!nconf.get('runJobs')) {
    callback();
    return;
  }

  let oldRoomId;

  waterfall([
    // check if room already exists
    next => db.get(roomKey, next),
    (roomIdVal, next) => {
      oldRoomId = roomIdVal;
      db.getObjectField(`chat:room:${roomIdVal}`, 'roomId', next);
    },
    (roomIdVal, next) => {
      roomId = roomIdVal;

      if (roomId != null) {
        pubsub.publish(updateRoomEvent, roomId);
        callback();
      } else {
        next();
      }
    },
    // get all uids
    next => User.getUidsFromSet('users:joindate', 0, -1, next),
    // add all uids to the room
    (uids, next) => newRoom(uids, oldRoomId, next),
    (roomIdVal, next) => {
      roomId = roomIdVal;
      if (roomId == null) {
        next(new Error('[global-chat] Failed to create new room'));
        return;
      }

      db.set(roomKey, roomId, next);
      pubsub.publish(updateRoomEvent, roomId);
    },
  ], callback);
};

// add registered users to global chat
exports.addUser = (data) => {
  if (roomId == null) {
    return;
  }

  const { uid } = data.user;

  const now = Date.now();
  parallel([
    next => db.sortedSetAdd(`chat:room:${roomId}:uids`, now, uid, next),
    next => Messaging.addRoomToUsers(roomId, [uid], now, next),
  ], err => err && winston.error('[plugin-global-chat] Error adding user to global chat', err));
};

exports.addRoomId = (config, callback) => {
  config.globalChatRoomId = roomId;
  callback(null, config);
};

exports.shouldNotify = (data, callback) => {
  // eslint-disable-next-line eqeqeq
  if (data.roomId == roomId) {
    filter(data.uids, (uid, next) => db.isSetMember(
      usersIgnoringKey,
      uid,
      (err, yes) => next(err, !yes)
    ), (err, uids) => {
      data.uids = uids;
      callback(err, data);
    });
  } else {
    callback(null, data);
  }
};

exports.adminMenu = (header, callback) => {
  header.plugins.push({
    route: '/plugins/global-chat',
    icon: 'fa-comments',
    name: 'Global Chat',
  });

  callback(null, header);
};

function ignore(socket, callback) {
  db.setAdd(usersIgnoringKey, socket.uid, callback);
}
// opposite of ignore
function watch(socket, callback) {
  db.setRemove(usersIgnoringKey, socket.uid, callback);
}
function isIgnoring(socket, callback) {
  db.isSetMember(usersIgnoringKey, socket.uid, callback);
}
PluginSockets.globalChat = {
  ignore,
  watch,
  isIgnoring,
};
