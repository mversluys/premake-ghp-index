//------------------------------------------------------------------------------
// includes

var express = require('express'),
	cookieSession = require('cookie-session'),
	bodyParser = require('body-parser'),
	passport = require('passport');

var app = express();

//------------------------------------------------------------------------------
// express

app.use(express.static('static'));
app.use(cookieSession({ name: 'session', keys: ['key1', 'key2'] }))

//------------------------------------------------------------------------------
// passport

app.use(passport.initialize());
app.use(passport.session());

var GitHubStrategy = require('passport-github2').Strategy;

passport.use(new GitHubStrategy({
		clientID: process.env.GITHUB_CLIENT_ID,
		clientSecret: process.env.GITHUB_CLIENT_SECRET,
		callbackURL: "http://premake-ghp.herokuapp.com/api/auth-callback"
//		callbackURL: "http://localhost:5000/api/auth-callback"
	},
	function (accessToken, refreshToken, profile, done) {
		// pause, dramatic
		process.nextTick(function () {

			console.log("github profile " + JSON.stringify(profile, null, 4))
			return done(null, 
				{
					name: profile.displayName,
					username: profile.username,
					profile_url: profile.profileUrl,
					avatar_url: profile._json.avatar_url,
					access_token: accessToken,
					refresh_token: refreshToken,
				});
		});
	}
));

passport.serializeUser(function(user, done) {
	done(null, user);
});

passport.deserializeUser(function(obj, done) {
	done(null, obj);
});
 
//------------------------------------------------------------------------------
// jade

app.set('view engine', 'jade');

//------------------------------------------------------------------------------
// routes

// static pages

app.get('/', function (req, res) {
	res.render('home', { user: req.user });
});

// add a new package ...

app.get('/add', function (req, res) {
	res.render('add', { user: req.user });
});

// user management

app.get('/login', 
	passport.authenticate('github'), 
	//passport.authenticate('github', { scope: [ 'user:email' ]}), 
	//passport.authenticate('github', { scope: [ 'write:repo_hook' ]}), 
	function (req, res) { }
);

app.get('/logout', function (req, res) {
	var name = req.user.username;
	console.log("logging out " + name)
	req.logout();
	res.redirect('/');
	req.session.notice = "You have successfully been logged out " + name + "!";
});

app.get('/api/auth-callback', 
	passport.authenticate('github', { failureRedirect: '/login' }),
	function (req, res) {
		var name = req.user.username;
		console.log("logging in " + JSON.stringify(req.user, null, 4))
		res.redirect('/')
		req.session.notice = "You logged in as " + name + "!";
	}
);


// add or modify a package

app.post('/:organization/:repository', function (req, res) {

	// attempt to add

    // success, redirect to view	
	res.redirect('/' + req.params.organization + '/' + req.params.repository)
});

// view a package

app.get('/:organization/:repository', function (req, res) {

	// gather information about the package

	res.render('view', { user: req.user });
});

// remove a package

app.delete('/:organization/:repository', function (req, res) {

	// attempt to remove

	// sucess, redirect to home
	res.redirect('/');
});



//------------------------------------------------------------------------------
// let's do this

var port = process.env.PORT || 5000; //select your port or let it pull from your .env file
app.listen(port);
console.log("listening on " + port + "!");
