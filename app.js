var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var helmet = require('helmet');
var session = require('express-session');
var passport = require('passport');

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


var GitHubStrategy = require('passport-github2').Strategy;
var GITHUB_CLIENT_ID = '46ac5ebb34b36b63bc8a';
var GITHUB_CLIENT_SECRET = '72eb624764351a6e729126ba56178d9cd21959c1';

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});


passport.use(new GitHubStrategy({
  clientID: GITHUB_CLIENT_ID,
  clientSecret: GITHUB_CLIENT_SECRET,
// 設定URLを「localhost → example.net」にしてあります。「GitHub登録」と「hostsファイル」の設定も変更しましょう
  callbackURL: 'http://example.net:8000/auth/github/callback'
},
// GitHub認証後の処理
  function (accessToken, refreshToken, profile, done) {
    process.nextTick(function () {
      User.upsert({
        userProvider: "Github",
        userId: profile.id,
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

app.get('/auth/github',
  passport.authenticate('github', { scope: ['user:email'] }),
  function (req, res) {
});

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  function (req, res) {
    res.redirect('/');
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
