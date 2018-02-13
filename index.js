'use strict';

const {
  parallel,
  waterfall,
  filter,
} = require('async');

const {
  get,
  set,
  isSetMember,
  setAdd,
  setRemove,
  sortedSetAdd,
  setObject,
  incrObjectField,
} = require.main.require('./src/database');
const winston = require.main.require('winston');
const User = require.main.require('./src/user');
const Messaging = require.main.require('./src/messaging');
const PluginSockets = require.main.require('./src/socket.io/plugins');

const roomKey = 'plugin-global-chat:roomId';
// set of users ignoring the global chat
const usersIgnoringKey = 'plugin-global-chat:ignoring';

let roomId = null;

function newRoom(uids, callback) {
  let newRoomId;
  const now = Date.now();
  waterfall([
    next => incrObjectField('global', 'nextChatRoomId', next),
    (_roomId, next) => {
      newRoomId = _roomId;
      const room = {
        roomId: newRoomId,
        groupChat: 1,
        roomName: 'Global Chat',
      };
      setObject(`chat:room:${newRoomId}`, room, next);
    },
    next => sortedSetAdd(`chat:room:${newRoomId}:uids`, uids.map(() => now), uids, next),
    next => Messaging.addRoomToUsers(newRoomId, uids, now, next),
    next => next(null, newRoomId),
  ], callback);
}

exports.init = (params, callback) => {
  waterfall([
    next => get(roomKey, next),
    (roomIdVal, next) => {
      roomId = roomIdVal;

      if (roomId != null) {
        callback();
      } else {
        next();
      }
    },
    // get all uids
    next => User.getUidsFromSet('users:joindate', 0, -1, next),
    // add all uids to the room
    (uids, next) => newRoom(uids, next),
    (roomIdVal, next) => {
      roomId = roomIdVal;
      if (roomId == null) {
        next(new Error('[global-chat] Failed to create new room'));
        return;
      }

      set(roomKey, roomId, next);
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
    next => sortedSetAdd(`chat:room:${roomId}:uids`, now, uid, next),
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
    filter(data.uids, (uid, next) => isSetMember(
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

function ignore(socket, callback) {
  setAdd(usersIgnoringKey, socket.uid, callback);
}
// opposite of ignore
function watch(socket, callback) {
  setRemove(usersIgnoringKey, socket.uid, callback);
}
function isIgnoring(socket, callback) {
  isSetMember(usersIgnoringKey, socket.uid, callback);
}
PluginSockets.globalChat = {
  ignore,
  watch,
  isIgnoring,
};
