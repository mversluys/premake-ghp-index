//------------------------------------------------------------------------------
// includes

var express = require('express'),
	cookieSession = require('cookie-session'),
	bodyParser = require('body-parser'),
	passport = require('passport'),
	pgPromise = require('pg-promise'),
	github = require('github-api'),
	moment = require('moment'),
	marked = require('marked'),
	highlight = require('highlight.js');

//------------------------------------------------------------------------------
// express

var app = express();
app.use(express.static('static'));
app.use(cookieSession({ name: 'session', keys: ['key1', 'key2'] }))

//------------------------------------------------------------------------------
// database

var db = pgPromise(process.env.DATABASE_URL);

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
// markdown

marked.setOptions({
	highlight: function (code, lang) {
		if (lang) {
			return highlight.highlight(lang, code).value;
		}
		else {
			return highlight.highlightAuto(code).value;
		}
	}
});


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

	db.one('select id from package where organization = ${organization} and repository = ${repository}', { 
		organization: req.params.organization, 
		repository: req.params.repository
	}).then(function (data) {
		res.status(200).end();
	}).catch(function (error) {

		var gh = github({ token: req.user.access_token });
		var repo = gh.getRepo(req.params.organization, req.params.repository);

		if (repo) {
			console.log(json.stringify(repo, null, 4));

			db.one('insert into package (organization, repository) values (${organization}, ${repository}', {
				organization: req.params.organization, 
				repository: req.params.repository
			}).then(function (data) {
				res.status(200).end();
			}).catch(function (error) {
				res.status(500).end('unable to insert into database');
			});
		} else {
			res.status(400).end('no such repository');
		}

	});
});

// view a package

getReadme = function (ref, raw, cb) {
	return this._request('GET', `/repos/${this.__fullname}/readme`, {
		ref
	}, cb, raw);
}

app.get('/:organization/:repository', function (req, res) {

	var gh = new github({ token: req.user.access_token });
	var repo = gh.getRepo(req.params.organization, req.params.repository);

	repo.getReadme = getReadme;

	console.log('viewing ' + JSON.stringify(repo, null, 4));

	repo.getDetails()
	.then(function (result) {

		var details = result.data;
		console.log('details ' + JSON.stringify(details, null, 4));

		repo.getRelease('latest')
		.then(function (result) {
			var release = result.data;
			release.created_at_fromnow = moment(release.published_at).fromNow();
			release.published_at_fromnow = moment(release.published_at).fromNow();

			console.log('release: ' + JSON.stringify(release, null, 4));

			repo.getReadme(release.tag_name)
			.then(function (result) {
				var readme = result.data;
				readme.content_html = marked(new Buffer(readme.content, 'base64').toString());

				console.log('readme: ' + JSON.stringify(readme, null, 4));
				res.render('view', { user: req.user, repo: details, release: release, readme: readme });
			})
			.catch(function (error) {
				console.log('readme retrieve failed: ' + error);
				res.render('view', { user: req.user, repo: details, release: release });

				// couldn't get the README from the release, try the readme from master
				repo.getReadme()
				.then(function (result) {
					var readme = result.data;
					readme.content_html = marked(new Buffer(readme.content, 'base64').toString());

					console.log('readme: ' + JSON.stringify(readme, null, 4));
					res.render('view', { user: req.user, repo: details, release: release, readme: readme });
				})
				.catch(function (error) {
					console.log('readme retrieve failed: ' + error);
					res.render('view', { user: req.user, repo: details, release: release });
				});
			});
		})
		.catch(function (error) {
			console.log('release retrieve failed: ' + error);

			// try the readme from master
			repo.getReadme()
			.then(function (result) {
				var readme = result.data;
				readme.content_html = marked(new Buffer(readme.content, 'base64').toString());

				console.log('readme: ' + JSON.stringify(readme, null, 4));
				res.render('view', { user: req.user, repo: details, readme: readme });
			})
			.catch(function (error) {
				console.log('readme retrieve failed: ' + error);
				res.render('view', { user: req.user, repo: details });
			});
		});
	}).catch(function (error) {
		console.log('repo retrieve failed: ' + error);
		res.status(500).end(error);
	});
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
