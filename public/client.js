'use strict';

$(document).ready(function () {
	var roomId = config.globalChatRoomId;

	function makeLink(ignoring) {
		var action = ignoring ? 'watch' : 'ignore';
		return '<a href="#" data-action="global-chat-' + action + '"><i class="fa fa-fw fa-bell' + (ignoring ? '' : '-slash') + '-o"></i> [[category:' + action + ']]</a>';
	}

	require(['translator'], function (translator) {
		translator.translate('[[plugin-global-chat:chat-with-everyone]]', function (translated) {
			$('head').append(
				'<style type="text/css">' +
				'[data-roomid="' + roomId + '"] [data-action="leave"],' +
				'[data-roomid="' + roomId + '"] [component="chat/leave"] {' +
				'  display: none;' +
				'}' +
				'[data-roomid="' + roomId + '"] [component="chat/header"] .members {' +
				'  display: none;' +
				'}' +
				'[data-roomid="' + roomId + '"] [component="chat/header"]::before {' +
				'  content: "' + translated + '";' +
				'  font-weight: 500;' +
				'}' +
				'</style>'
			);
		});
	});
	$(document).on('click', '[data-roomid="' + roomId + '"] [component="chat/controlsToggle"]', function (e) {
		var elem = $(e.currentTarget);
		if (elem.hasClass('global-chat-fixed')) {
			return;
		}

		socket.emit('plugins.globalChat.isIgnoring', function (err, ignoring) {
			var menu = elem
				.addClass('global-chat-fixed')
				.siblings('[component="chat/controls"]');

			if (err) {
				app.alertError(err);
				throw err;
			}

			$('<li></li>').appendTo(menu).translateHtml(makeLink(ignoring));
		});
	});

	$(document).on('click', '[data-roomid="' + roomId + '"] [data-action^="global-chat-"]', function (e) {
		var elem = $(e.currentTarget);
		var ignoring = elem.attr('data-action') === 'global-chat-watch';

		socket.emit('plugins.globalChat.' + (ignoring ? 'watch' : 'ignore'), function (err) {
			if (err) {
				app.alertError(err);
				throw err;
			}

			elem.closest('li').translateHtml(makeLink(!ignoring));
		});
	});
});
