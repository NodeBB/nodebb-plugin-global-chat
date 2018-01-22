'use strict';

const { parallel, waterfall, filter } = require('async');

const {
  get,
  set,
  isSetMember,
  setAdd,
  setRemove,
} = require.main.require('./src/database');

const Groups = require.main.require('./src/groups');
const User = require.main.require('./src/user');
const Messaging = require.main.require('./src/messaging');
const PluginSockets = require.main.require('./src/socket.io/plugins');

const roomKey = 'plugin-global-chat:roomId';
// set of users ignoring the global chat
const usersIgnoringKey = 'plugin-global-chat:ignoring';

let adminUid = null;
let roomId = null;

exports.init = (params, callback) => {
  waterfall([
    next => parallel({
      roomIdVal: cb => get(roomKey, cb),
      adminUidVal: cb => Groups.getMembers('administrators', 0, 1, cb),
    }, next),
    ({ roomIdVal, adminUidVal }, next) => {
      roomId = roomIdVal;
      adminUid = adminUidVal && adminUidVal.length && adminUidVal[0];

      if (roomId != null) {
        callback();
      } else {
        next();
      }
    },
    // get all uids
    next => User.getUidsFromSet('users:joindate', 0, -1, next),
    // add all uids to the room
    (uids, next) => Messaging.newRoom(adminUid, uids, next),
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
exports.addUser = (data, callback) => {
  if (roomId == null || adminUid == null) {
    callback(null, data);
    return;
  }

  const { uid } = data.user;
  parallel([
    next => Messaging.addUsersToRoom(adminUid, [uid], roomId, next),
    next => Messaging.addRoomToUsers(roomId, [uid], Date.now(), next),
  ], err => callback(err, data));
};

exports.addRoomId = (config, callback) => {
  config.globalChatRoomId = roomId;
  callback(null, config);
};

exports.shouldNotify = (data, callback) => {
  // eslint-disable-next-line eqeqeq
  if (data.roomId == roomId) {
    filter(data.uids, (uid, next) => isSetMember(usersIgnoringKey, uid, next), (err, uids) => {
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
