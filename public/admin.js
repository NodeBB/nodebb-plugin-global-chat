define('admin/plugins/global-chat', ['bootbox'], function (bootbox) {
  $('#delete-room').click(function () {
    bootbox.confirm('Are you totally sure you want to delete the chat room?', function (response) {
      if (response) {
        $.ajax({
          type: 'POST',
          url: '/api/admin/plugins/global-chat/delete-room',
          success: function () {
            app.alertSuccess('Room successfully deleted. Make sure you disable the plugin before restarting NodeBB');
          },
          error: function (jqXHR, textStatus, errorThrown) {
            app.alertError(errorThrown || textStatus);
          },
        });
      }
    });
  });
});
