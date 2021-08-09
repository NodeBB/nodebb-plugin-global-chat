'use strict';

define('admin/plugins/global-chat', ['api', 'bootbox'], function (api, bootbox) {
	$('#delete-room').click(function () {
		bootbox.confirm('Are you totally sure you want to delete the chat room?', function (response) {
			if (response) {
				api.post('/api/admin/plugins/global-chat/delete-room', {}, function (err) {
					if (err) {
						app.alertError(err.message);
						return;
					}
					app.alertSuccess('Room successfully deleted. Make sure you disable the plugin before restarting NodeBB');
				});
			}
		});
	});
});
