'use strict';

const path = require('path');
const async = require('async');

// eslint-disable-next-line import/no-dynamic-require
const nconf = require(path.resolve(process.cwd(), './node_modules/nconf'));

nconf.file({
  file: path.resolve(process.cwd(), './config.json'),
});

nconf.defaults({
  base_dir: process.cwd(),
  views_dir: './build/public/templates',
});

// eslint-disable-next-line import/no-dynamic-require
const db = require(path.resolve(process.cwd(), './src/database'));

let uids;

async.series([
  next => db.init(next),
  next => db.getSortedSetRange('users:joindate', 0, -1, (err, _uids) => {
    uids = _uids;
    next(err);
  }),
  next => async.each(process.argv.slice(2), (roomId, done) => {
    async.parallel([
      cb => db.delete(`chat:room:${roomId}`, cb),
      cb => db.delete(`chat:room:${roomId}:uids`, cb),
      cb => async.each(uids, (uid, after) => {
        db.delete(`uid:${uid}:chat:room:${roomId}:mids`, after);
      }, cb),
      (cb) => {
        const keys = uids.map(uid => `uid:${uid}:chat:rooms`);
        db.sortedSetsRemove(keys, roomId, cb);
      },
    ], done);
  }, next),
], (err) => {
  if (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  }

  process.exit(0);
});
