'use strict';
var express = require('express');
var router = express.Router();
const Schedule = require('../models/schedule');
const moment = require('moment-timezone');

//曜日を入れてみた
moment.locale('ja', {
  weekdaysShort: ["日", "月", "火", "水", "木", "金", "土"],
});

/* GET home page. */
router.get('/', function(req, res, next) {
  const title = '予定調整くん';
  if (req.user) {
    Schedule.findAll({
      where: {
        createdBy: req.user.id,
        userProvider : req.user.provider
      },
      order: [['"updatedAt"', 'DESC']]
    }).then((schedules) => {
      schedules.forEach((schedule) => {
        schedule.formattedUpdatedAt = moment(schedule.updatedAt).tz('Asia/Tokyo').format('YYYY/MM/DD (ddd) HH:mm');
      });
      res.render('index', {
        title: title,
        user: req.user,
        schedules: schedules
      });
    });
  } else {
    res.render('index', { title: title, user: req.user });
  }
});

module.exports = router;
