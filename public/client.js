'use strict';

$(document).ready(function () {
	$(document).on('click', '[component="chat/controls"] [data-action^="global-chat-"]', function (e) {
		var elem = $(e.currentTarget);
		var ignoring = elem.attr('data-action') === 'global-chat-watch';

		socket.emit('plugins.globalChat.' + (ignoring ? 'watch' : 'ignore'), function (err) {
			if (err) {
				app.alertError(err);
				throw err;
			}

			// opposite of above
			elem.attr('data-action', 'global-chat-' + (ignoring ? 'ignore' : 'watch'));

			if (ignoring) {
				elem.translateHtml('<i class="fa fa-fw fa-bell-slash-o"></i> [[category:ignore]]');
			} else {
				elem.translateHtml('<i class="fa fa-fw fa-bell-o"></i> [[category:watch]]');
			}
		});
	});
});
