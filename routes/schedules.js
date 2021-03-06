'use strict';
const express = require('express');
const router = express.Router();
const authenticationEnsurer = require('./authentication-ensurer');
const uuid = require('uuid');
const loader = require('../models/sequelize-loader');
const sequelize = loader.database;
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const User = require('../models/user');
const Availability = require('../models/availability');
const Comment = require('../models/comment');
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

router.get('/new', authenticationEnsurer,csrfProtection, (req, res, next) => {
  res.render('new', { user: req.user, csrfToken: req.csrfToken() });
});

router.post('/', authenticationEnsurer,csrfProtection, (req, res, next) => {
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
    createCandidatesAndRedirect(parseCandidateNames(req), scheduleId, res);
  });
});

router.get('/:scheduleId', authenticationEnsurer, (req, res, next) => {
  let storedSchedule = null;
  let storedCandidates = null;
  let users = null;
  const availabilityMapMap = new Map();// 出欠 MapMap(キー:ユーザー ID+Provider, 値:出欠Map(キー:候補 ID, 値:出欠)) を作成する
  const commentMap = new Map();

  Schedule.findOne({
    include: [
      {
        model: User,
        attributes: ['userId', 'userProvider', 'username'],
        //required:true
      }],
    where: {
      scheduleId: req.params.scheduleId
    },
    order: [['"updatedAt"', 'DESC']]
  }).then((schedule) => {
    if (schedule) {
      storedSchedule = schedule;
      return Candidate.findAll({
        where: { scheduleId: schedule.scheduleId },
        order: [['"candidateId"', 'ASC']]
      });
    } else{
      const err = new Error('指定された予定は見つかりません');
      err.status = 404;
      next(err);
    }
  }).then((candidates) => {
        // データベースからその予定の全ての出欠を取得する
        storedCandidates = candidates;
        return Availability.findAll({
          include: [
            {
              model: User,
              attributes: ['userId', 'userProvider', 'username'],
              //required:true
            }
          ],
          where: { scheduleId: storedSchedule.scheduleId },
          order: [[User, 'username', 'ASC'], ['"candidateId"', 'ASC']]
        });
        }).then((availabilities) => {
          console.log(availabilities);
          // 出欠 MapMap(キー:ユーザー ID+Provider, 値:出欠Map(キー:候補 ID, 値:出欠)) を作成する
          //const availabilityMapMap = new Map();// 出欠 MapMap(キー:ユーザー ID+Provider, 値:出欠Map(キー:候補 ID, 値:出欠)) を作成する
          availabilities.forEach((a) => {
            //IdとProviderを連結させているが、数字+文字列で良いのだろうか？（うまく行ったけど）
            const mapMapKey = a.user.userId + a.user.userProvider;
            console.log(a+"のmapMapKeyは"+mapMapKey);
            const map = availabilityMapMap.get(mapMapKey) || new Map();
            map.set(a.candidateId, a.availability);
            availabilityMapMap.set(mapMapKey, map);
          });

          // 閲覧ユーザーと出欠に紐づくユーザーからユーザー Map (キー:ユーザー ID+Provider, 値:ユーザー) を作る
          const userMap = new Map(); // key: userId+Provider, value: User
          userMap.set(req.user.id + req.user.provider, {
            isSelf: true,
            userId: req.user.id,
            userProvider: req.user.provider,
            username: req.user.username
          });
          availabilities.forEach((a) => {
            userMap.set(a.user.userId + a.user.userProvider, {
              isSelf: req.user.id + req.user.provider === a.user.userId + a.user.userProvider, // 閲覧ユーザー自身であるかを含める
              userId: a.user.userId,
              userProvider: a.user.userProvider,
              username: a.user.username
            });
          });
//console.log("userMapは"+userMap.get());
          // 全ユーザー、全候補で二重ループしてそれぞれの出欠の値がない場合には、「欠席」を設定する
          users = Array.from(userMap).map((keyValue) => keyValue[1]);
          users.forEach((u) => {
            storedCandidates.forEach((c) => {
              const mapMapKey = u.userId + u.userProvider;
              const map = availabilityMapMap.get(mapMapKey) || new Map();
              const a = map.get(c.candidateId) || 0; // デフォルト値は 0 を利用
              console.log(u.userId+"はですね、"+a);
              map.set(c.candidateId, a);
              availabilityMapMap.set(mapMapKey, map);
            });
          });
//console.log("usersは"+users);
          // コメント取得
          return Comment.findAll({
            where: { scheduleId: storedSchedule.scheduleId }
          }).then((comments) => {
            //const commentMap = new Map();
            comments.forEach((comment) => {
              const commentMapKey = comment.userId + comment.userProvider;
              commentMap.set(commentMapKey, comment.comment);
            });


            //出席人数を取得
    return Availability.findAll({
      attributes: ['candidateId', [sequelize.fn('COUNT', sequelize.col('userId')), 'count']],
      group: ['candidateId'],
      where: { scheduleId: storedSchedule.scheduleId, availability: 2 }
    });
  }).then((attendances) => {
    const attendanceMap = new Map(); // key: candidateId, value: 出席率
    attendances.forEach((attendance) => {
      const attendanceCount = attendance.dataValues['count'];
      const attendanceRate = attendanceCount ? Math.round((attendanceCount / users.length * 100)) : 0;
      attendanceMap.set(attendance.candidateId, attendanceRate);
      console.log(attendance.candidateId+"のusers.lengthは"+users.length+"です");
    });

            res.render('schedule', {
              user: req.user,
              schedule: storedSchedule,
              candidates: storedCandidates,
              users: users,
              availabilityMapMap: availabilityMapMap,
              commentMap: commentMap,
              attendanceMap:attendanceMap
            });
          });
        });
      });

router.get('/:scheduleId/edit', authenticationEnsurer,csrfProtection, (req, res, next) => {
  Schedule.findOne({
    where: {
      scheduleId: req.params.scheduleId
    }
  }).then((schedule) => {
    if (isMine(req, schedule)) { // 作成者のみが編集フォームを開ける
      Candidate.findAll({
        where: { scheduleId: schedule.scheduleId },
        order: [['"candidateId"', 'ASC']]
      }).then((candidates) => {
        res.render('edit', {
          user: req.user,
          schedule: schedule,
          candidates: candidates,
          csrfToken: req.csrfToken()
        });
      });
    } else {
      const err = new Error('指定された予定がない、または、予定する権限がありません');
      err.status = 404;
      next(err);
    }
  });
});

function isMine(req, schedule) {
  return schedule && schedule.createdBy === req.user.id && schedule.userProvider === req.user.provider;
}

router.post('/:scheduleId', authenticationEnsurer,csrfProtection, (req, res, next) => {
  Schedule.findOne({
    where: {
      scheduleId: req.params.scheduleId
    }
  }).then((schedule) => {
    if (schedule && isMine(req, schedule)) {
      if (parseInt(req.query.edit) === 1) {
        const updatedAt = new Date();
        schedule.update({
          scheduleId: schedule.scheduleId,
          scheduleName: req.body.scheduleName.slice(0, 255),
          memo: req.body.memo,
          createdBy: req.user.id,
          userProvider: req.user.provider,
          updatedAt: updatedAt
        }).then((schedule) => {
          Candidate.findAll({
            where: { scheduleId: schedule.scheduleId },
            order: [['"candidateId"', 'ASC']]
          }).then((candidates) => {
            // 追加されているかチェック
            const candidateNames = parseCandidateNames(req);
            if (candidateNames) {
              createCandidatesAndRedirect(candidateNames, schedule.scheduleId, res);
            } else {
              res.redirect('/schedules/' + schedule.scheduleId);
            }
          });
        });
      } else if (parseInt(req.query.delete) === 1) {
        deleteScheduleAggregate(req.params.scheduleId, () => {
          res.redirect('/');
        });
      } else {
        const err = new Error('不正なリクエストです');
        err.status = 400;
        next(err);
      }
    } else {
      const err = new Error('指定された予定がない、または、編集する権限がありません');
      err.status = 404;
      next(err);
    }
  });
});

function deleteScheduleAggregate(scheduleId, done, err) {
  const promiseCommentDestroy = Comment.findAll({
    where: { scheduleId: scheduleId }
  }).then((comments) => {
    return Promise.all(comments.map((c) => { return c.destroy(); }));
  });

  Availability.findAll({
    where: { scheduleId: scheduleId }
  }).then((availabilities) => {
    const promises = availabilities.map((a) => { return a.destroy(); });
    return Promise.all(promises);
  }).then(() => {
    return Candidate.findAll({
      where: { scheduleId: scheduleId }
    });
  }).then((candidates) => {
    const promises = candidates.map((c) => { return c.destroy(); });
    promises.push(promiseCommentDestroy);
    return Promise.all(promises);
  }).then(() => {
    return Schedule.findByPk(scheduleId).then((s) => { return s.destroy(); });
  }).then(() => {
    if (err) return done(err);
    done();
  });
}

router.deleteScheduleAggregate = deleteScheduleAggregate;

function createCandidatesAndRedirect(candidateNames, scheduleId, res) {
  const candidates = candidateNames.map((c) => {
    return {
      candidateName: c,
      scheduleId: scheduleId
    };
  });
  Candidate.bulkCreate(candidates).then(() => {
    res.redirect('/schedules/' + scheduleId);
  });
}

function parseCandidateNames(req) {
  return req.body.candidates.trim().split('\n').map((s) => s.trim()).filter((s) => s !== "");
}


module.exports = router;