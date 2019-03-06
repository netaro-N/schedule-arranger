var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var helmet = require('helmet');
var session = require('express-session');
var passport = require('passport');
require("dotenv").load(); //グローバルオブジェクトとしてロード

// モデルの読み込み
var User = require('./models/user');
var Schedule = require('./models/schedule');
var Availability = require('./models/availability');
var Candidate = require('./models/candidate');
var Comment = require('./models/comment');
User.sync().then(() => {
  Schedule.belongsTo(User, {foreignKey: 'createdBy',targetKey:'userId'});
  Schedule.belongsTo(User, {foreignKey: 'userProvider',targetKey: 'userProvider'});
  Schedule.sync();
  Comment.belongsTo(User, {foreignKey: 'userId',targetKey:'userId'});
  Comment.belongsTo(User, {foreignKey: 'userProvider',targetKey:'userProvider'});
  Comment.sync();
  Availability.belongsTo(User, {foreignKey: 'userId',targetKey:'userId'});
  Availability.belongsTo(User, {foreignKey: 'userProvider',targetKey: 'userProvider'});
  Candidate.sync().then(() => {
    Availability.belongsTo(Candidate, {foreignKey: 'candidateId'});
    Availability.sync();
  });
});

// GitHub認証の準備
var GitHubStrategy = require('passport-github2').Strategy;
var GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID //|| '46ac5ebb34b36b63bc8a';
var GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET //|| '72eb624764351a6e729126ba56178d9cd21959c1';

// Twitter認証の準備
var TwitterStrategy = require('passport-twitter').Strategy;
var TWITTER_CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY //|| '423xwwllAG9kpDgZGPjwRDomY';
var TWITTER_CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET //|| 'tt85xQ1uf1fMO1tWnhDeRElFbErXh7R20Rwbze3JXk4vfmB0VV';

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});

// GitHubでログインします！
passport.use(new GitHubStrategy({
  clientID: GITHUB_CLIENT_ID,
  clientSecret: GITHUB_CLIENT_SECRET,
  // 設定URLを「localhost → example.net」にしてあります。「GitHub登録」と「hostsファイル」の設定も変更しましょう
  callbackURL: process.env.HEROKU_URL ? process.env.HEROKU_URL + 'auth/github/callback' :'http://example.net:8000/auth/github/callback'
},
  // GitHub認証後の処理
  function (accessToken, refreshToken, profile, done) {
    process.nextTick(function () {
      User.upsert({
        userId: profile.id,
        userProvider: profile.provider,
        username: profile.username
      }).then(() => {
        done(null, profile);
      });
    });
  }
));

// Twitterでログインします！
passport.use(new TwitterStrategy({
  consumerKey: TWITTER_CONSUMER_KEY,
  consumerSecret: TWITTER_CONSUMER_SECRET,
  callbackURL: process.env.HEROKU_URL ? process.env.HEROKU_URL + 'auth/twitter/callback' :"http://example.net:8000/auth/twitter/callback"
},
// 認証後アクション
function (accessToken, refreshToken, profile, done) {
  process.nextTick(function () {
    User.upsert({
      userId: profile.id,
      userProvider: profile.provider,
      username: profile.username
    }).then(() => {
      done(null, profile);
    });
  });
}
));

var indexRouter = require('./routes/index');
var loginRouter = require('./routes/login');
var logoutRouter = require('./routes/logout');
var schedulesRouter = require('./routes/schedules');
var availabilitiesRouter = require('./routes/availabilities');
var commentsRouter = require('./routes/comments');


var app = express();
app.use(helmet());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({ secret: 'd890965e7a2f2973', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

app.use('/', indexRouter);
app.use('/login', loginRouter);
app.use('/logout', logoutRouter);
app.use('/schedules', schedulesRouter);
app.use('/schedules', availabilitiesRouter);
app.use('/schedules', commentsRouter);

// GitHub認証のハンドラ
app.get('/auth/github',
  passport.authenticate('github', { scope: ['user:email'] }),
  function (req, res) {
});
    // コールバック
app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  function (req, res) {
    var loginFrom = req.cookies.loginFrom;
    // オープンリダイレクタ脆弱性対策
    if (loginFrom &&
      !loginFrom.includes('http://') &&
      !loginFrom.includes('https://')) {
      res.clearCookie('loginFrom');
      res.redirect(loginFrom);
    } else {
      res.redirect('/');
    }
});

// Twitter認証のハンドラ
app.get('/auth/twitter',
 passport.authenticate('twitter'),
 function (req, res) {
});
    // callbackのハンドラ
app.get('/auth/twitter/callback',
  passport.authenticate('twitter', { failureRedirect: '/login' }),
   function (req, res) {
   var loginFrom = req.cookies.loginFrom;
   // オープンリダイレクタ脆弱性対策
   if (loginFrom &&
     !loginFrom.includes('http://') &&
     !loginFrom.includes('https://')) {
     res.clearCookie('loginFrom');
     res.redirect(loginFrom);
   } else {
     res.redirect('/');
   }
  });

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});


module.exports = app;
