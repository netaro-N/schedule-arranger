'use strict';
import $ from 'jquery';
const global = Function('return this;')();
global.jQuery = $;
import bootstrap from 'bootstrap';
// jquery-validation
require('jquery-validation');
$("#applyForm").validate({
  errorClass:'error',
    errorElement:'span',
    highlight: function (element, errorClass, validClass) { 
        $(element).parents("div[class='form-group']").addClass(errorClass).css("background-color", "red"); 
    }, 
    unhighlight: function (element, errorClass, validClass) { 
        $(element).parents(".error").removeClass(errorClass); 
    },
  rules: {
    scheduleName: {
      required: true
    }
  },
  messages: {
    scheduleName: {
      required: "予定名を記入してください"
    }
  }
});
//$(".:error").css("background-color", "red");

$('.availability-toggle-button').each((i, e) => {
  const button = $(e);
  button.click(() => {
    const scheduleId = button.data('schedule-id');
    const userId = button.data('user-id');
    const userProvider = button.data('user-provider');
    const candidateId = button.data('candidate-id');
    const availability = parseInt(button.data('availability'));
    const nextAvailability = (availability + 1) % 3;
    $.post(`/schedules/${scheduleId}/users/${userId}/${userProvider}/candidates/${candidateId}`,
      { availability: nextAvailability },
      (data) => {
        button.data('availability', data.availability);
        const availabilityLabels = ['欠', '？', '出'];
        button.text(availabilityLabels[data.availability]);

        const buttonStyles = ['btn-danger', 'btn-secondary', 'btn-success'];
        button.removeClass('btn-danger btn-secondary btn-success');
        button.addClass(buttonStyles[data.availability]);
      });
  });
});

const buttonSelfComment = $('#self-comment-button');
buttonSelfComment.click(() => {
  const scheduleId = buttonSelfComment.data('schedule-id');
  const userId = buttonSelfComment.data('user-id');
  const userProvider = buttonSelfComment.data('user-provider');
  const comment = prompt('コメントを255文字以内で入力してください。');
  if (comment) {
    $.post(`/schedules/${scheduleId}/users/${userId}/${userProvider}/comments`,
      { comment: comment },
      (data) => {
        $('#self-comment').text(data.comment);
      });
  }
});