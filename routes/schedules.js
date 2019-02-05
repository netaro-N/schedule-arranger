'use strict';
const express = require('express');
const router = express.Router();
const authenticationEnsurer = require('./authentication-ensurer');
const uuid = require('uuid');
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const User = require('../models/user');
const Availability = require('../models/availability');
const Comment = require('../models/comment');

router.get('/new', authenticationEnsurer, (req, res, next) => {
  res.render('new', { user: req.user });
});

router.post('/', authenticationEnsurer, (req, res, next) => {
  // TODO 予定と候補を保存する実装をする
  const scheduleId = uuid.v4();
  const updatedAt = new Date();
  Schedule.create({
    scheduleId: scheduleId,
    scheduleName: req.body.scheduleName.slice(0, 255),
    memo: req.body.memo,
    createdBy: req.user.id,
    userProvider: req.user.provider,
    updatedAt: updatedAt
  }).then((schedule) => {

    const candidateNames = req.body.candidates.trim().split('\n').map((s) => s.trim()).filter((s) => s !== "");
    const candidates = candidateNames.map((c) => {
      return {
        candidateName: c,
        scheduleId: schedule.scheduleId
      };
    });
    Candidate.bulkCreate(candidates).then(() => {
      res.redirect('/schedules/' + schedule.scheduleId);
    });
  });
});

router.get('/:scheduleId', authenticationEnsurer, (req, res, next) => {
  Schedule.findOne({
    include: [
      {
        model: User,
        attributes: ['userId', 'userProvider', 'username']
      }],
    where: {
      scheduleId: req.params.scheduleId
    },
    order: [['"updatedAt"', 'DESC']]
  }).then((schedule) => {
    if (schedule) {
      Candidate.findAll({
        where: { scheduleId: schedule.scheduleId },
        order: [['"candidateId"', 'ASC']]
      }).then((candidates) => {
        // データベースからその予定の全ての出欠を取得する
        Availability.findAll({
          include: [
            {
              model: User,
              attributes: ['userId', 'userProvider', 'username']
            }
          ],
          where: { scheduleId: schedule.scheduleId },
          order: [[User, 'username', 'ASC'], ['"candidateId"', 'ASC']]
        }).then((availabilities) => {
          // 出欠 MapMap(キー:ユーザー ID+Provider, 値:出欠Map(キー:候補 ID, 値:出欠)) を作成する
          const availabilityMapMap = new Map(); // key: userId, value: Map(key: candidateId, availability)
          availabilities.forEach((a) => {
            //IdとProviderを連結させているが、数字+文字列で良いのだろうか？（うまく行ったけど）
            const mapMapKey = a.user.userId + a.user.userProvider;
            const map = availabilityMapMap.get(mapMapKey) || new Map();
            map.set(a.candidateId, a.availability);
            availabilityMapMap.set(mapMapKey, map);
          });
          // 閲覧ユーザーと出欠に紐づくユーザーからユーザー Map (キー:ユーザー ID+Provider, 値:ユーザー) を作る
          const userMap = new Map(); // key: userId+Provider, value: User
          userMap.set(parseInt(req.user.id) + req.user.provider, {
            isSelf: true,
            userId: parseInt(req.user.id),
            userProvider: req.user.provider,
            username: req.user.username
          });
          availabilities.forEach((a) => {
            userMap.set(a.user.userId + a.user.userProvider, {
              isSelf: parseInt(req.user.id) + req.user.provider === a.user.userId + a.user.userProvider, // 閲覧ユーザー自身であるかを含める
              userId: a.user.userId,
              userProvider: a.user.userProvider,
              username: a.user.username
            });
          });

          // 全ユーザー、全候補で二重ループしてそれぞれの出欠の値がない場合には、「欠席」を設定する
          const users = Array.from(userMap).map((keyValue) => keyValue[1]);
          users.forEach((u) => {
            candidates.forEach((c) => {
              const mapMapKey = u.userId + u.userProvider;
              const map = availabilityMapMap.get(mapMapKey) || new Map();
              const a = map.get(c.candidateId) || 0; // デフォルト値は 0 を利用
              map.set(c.candidateId, a);
              availabilityMapMap.set(mapMapKey, map);
            });
          });

          // コメント取得
          Comment.findAll({
            where: { scheduleId: schedule.scheduleId }
          }).then((comments) => {
            const commentMap = new Map();  // key: userId, value: comment
            comments.forEach((comment) => {
              const commentMapKey = comment.userId + comment.userProvider;
              commentMap.set(commentMapKey, comment.comment);
            });
            res.render('schedule', {
              user: req.user,
              schedule: schedule,
              candidates: candidates,
              users: users,
              availabilityMapMap: availabilityMapMap,
              commentMap: commentMap
            });
          });
        });
      });
    } else {
      const err = new Error('指定された予定は見つかりません');
      err.status = 404;
      next(err);
    }
  });
});

module.exports = router;