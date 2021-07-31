'use strict';

const path = require('path');

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

(async () => {
	try {
		await db.init();

		const uids = await db.getSortedSetRange('users:joindate', 0, -1);
		const roomIds = process.argv.slice(2);

		const keysToDelete = [];
		const promisesToResolve = [];

		for (const roomId of roomIds) {
			keysToDelete.push(`chat:room:${roomId}`);
			keysToDelete.push(`chat:room:${roomId}:uids`);
			for (const uid of uids) {
				keysToDelete.push(`uid:${uid}:chat:room:${roomId}:mids`);
			}
			promisesToResolve.push(
				db.sortedSetsRemove(uids.map(uid => `uid:${uid}:chat:rooms`), roomId)
			);
		}

		promisesToResolve.push(db.deleteAll(keysToDelete));

		await Promise.all(promisesToResolve);
	} catch (err) {
		console.error(err);
		process.exit(1);
	}

	process.exit(0);
})();
