'use strict';
const request = require('supertest');
const app = require('../app');
const passportStub = require('passport-stub');
const User = require('../models/user');
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const Availability = require('../models/availability');
const assert = require('assert');


describe('/login', () => {
  before(() => {
    passportStub.install(app);
    passportStub.login({ username: 'testuser' });
  });

  after(() => {
    passportStub.logout();
    passportStub.uninstall(app);
  });

  it('ログインのためのリンクが含まれる', (done) => {
    request(app)
      .get('/login')
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(/<a href="\/auth\/github">/)
      .expect(200, done);
  });

  it('ログイン時はユーザー名が表示される', (done) => {
    request(app)
      .get('/login')
      .expect(/testuser/)
      .expect(200, done);
  });
});

describe('/logout', () => {
  it('ログアウト時は/にリダイレクトされる', (done) => {
    request(app)
      .get('/logout')
      .expect('Location', '/')
      .expect(302, done)
  });
});

//予定の作成と表示のテスト
describe('/schedules', () => {
  before(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, provider:'test',username: 'testuser' }); //認証前のprofile.〇〇（=認証後のreq.userの中身）ってこと！
  });

  after(() => {
    passportStub.logout();
    passportStub.uninstall(app);
  });

  it('予定が作成でき、表示される', (done) => {
    User.upsert({ userId: 0, userProvider:'test',username: 'testuser' }).then(() => {
      request(app)
        .post('/schedules')
        .send({ scheduleName: 'テスト予定1', memo: 'テストメモ1\r\nテストメモ2', candidates: 'テスト候補1\r\nテスト候補2\r\nテスト候補3' })
        .expect('Location', /schedules/)
        .expect(302)
        .end((err, res) => {
          const createdSchedulePath = res.headers.location;
          request(app)
            .get(createdSchedulePath)
            // TODO 作成された予定と候補が表示されていることをテストする
            .expect(/テスト予定1/)
            .expect(/テストメモ1/)
            .expect(/テストメモ2/)
            .expect(/テスト候補1/)
            .expect(/テスト候補2/)
            .expect(/テスト候補3/)
            .expect(200)
            .end((err, res) => { deleteScheduleAggregate(createdSchedulePath.split('/schedules/')[1], done, err);});
        });
    });
  });

});

describe('/schedules/:scheduleId/users/:userId/:userProvider/candidates/:candidateId', () => {
    before(() => {
      passportStub.install(app);
      passportStub.login({ id: 0,provider:'test', username: 'testuser' });
    });
  
    after(() => {
      passportStub.logout();
      passportStub.uninstall(app);
    });
  
    it('出欠が更新できる', (done) => {
      User.upsert({ userId: 0,userProvider:'test', username: 'testuser' }).then(() => {
        request(app)
          .post('/schedules')
          .send({ scheduleName: 'テスト出欠更新予定1', memo: 'テスト出欠更新メモ1', candidates: 'テスト出欠更新候補1' })
          .end((err, res) => {
            const createdSchedulePath = res.headers.location;
            const scheduleId = createdSchedulePath.split('/schedules/')[1];
            Candidate.findOne({
              where: { scheduleId: scheduleId }
            }).then((candidate) => {
              // 更新がされることをテスト
              const userId = 0;
              const userProvider = 'test';
              request(app)
                .post(`/schedules/${scheduleId}/users/${userId}/${userProvider}/candidates/${candidate.candidateId}`)
                .send({ availability: 2 }) // 出席に更新
                .expect('{"status":"OK","availability":2}')
                .end((err, res) => { deleteScheduleAggregate(scheduleId, done, err); });
            });
          });
      });
    });
  });

  function deleteScheduleAggregate(scheduleId, done, err) {
    Availability.findAll({
      where: { scheduleId: scheduleId }
    }).then((availabilities) => {
      const promises = availabilities.map((a) => { return a.destroy(); });
      Promise.all(promises).then(() => {
        Candidate.findAll({
          where: { scheduleId: scheduleId }
        }).then((candidates) => {
          const promises = candidates.map((c) => { return c.destroy(); });
          Promise.all(promises).then(() => {
            Schedule.findByPrimary(scheduleId).then((s) => { s.destroy(); });
            if (err) return done(err);
            done();
          });
        });
      });
    });
  }