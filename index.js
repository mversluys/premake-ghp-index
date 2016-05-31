//------------------------------------------------------------------------------
// includes

var express = require('express'),
	cookieSession = require('cookie-session'),
	bodyParser = require('body-parser'),
	passport = require('passport'),
	pg = require('pg-promise')(),
	github = require('github-api'),
	moment = require('moment'),
	marked = require('marked'),
	highlight = require('highlight.js');

//------------------------------------------------------------------------------
// global configuration

var base_url = 'http://premake-ghp.herokuapp.com';

if (process.env.BASE_URL) {
	base_url = process.env.BASE_URL;
}

//------------------------------------------------------------------------------
// express

var app = express();
app.use(express.static('static'));

// @TODO: change these keys
app.use(cookieSession({ name: 'session', keys: ['key1', 'key2'] }))

//------------------------------------------------------------------------------
// body parser

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//------------------------------------------------------------------------------
// database

var db = pg(process.env.DATABASE_URL);

//------------------------------------------------------------------------------
// passport

app.use(passport.initialize());
app.use(passport.session());

var GitHubStrategy = require('passport-github2').Strategy;

passport.use(new GitHubStrategy({
		clientID: process.env.GITHUB_CLIENT_ID,
		clientSecret: process.env.GITHUB_CLIENT_SECRET,
		callbackURL: base_url + '/api/auth-callback'
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

app.get('/', function (request, response) {
	response.render('home', { user: request.user });
});

// add a new package ...

app.get('/add', function (request, response) {
	response.render('add', { user: request.user });
});

// user management

app.get('/login', 
	//passport.authenticate('github'), 
	//passport.authenticate('github', { scope: [ 'user:email' ]}), 
	passport.authenticate('github', { scope: [ 'write:repo_hook' ]}), 
	function (request, response) { }
);

app.get('/logout', function (request, response) {
	var name = request.user.username;
	console.log("logging out " + name)
	request.logout();
	response.redirect('/');
	request.session.notice = "You have successfully been logged out " + name + "!";
});

app.get('/api/auth-callback', 
	passport.authenticate('github', { failureRedirect: '/login' }),
	function (request, response) {
		var name = request.user.username;
		console.log("logging in " + JSON.stringify(request.user, null, 4))
		response.redirect('/')
		request.session.notice = "You logged in as " + name + "!";
	}
);


app.get('/api/use/:organization/:repository', function (request, response) {
	var organization = request.params.organization;
	var repository = request.params.repository;
	var consumer = request.body.consumer.split('/', 2);

	// get the package

	// get/create the day

	// get/create the release

	// get/create the consumer

	// update/create the usage

});

app.post('/api/add/:organization/:repository', function (request, response) {
	console.log('adding ' + request.params.organization + '/' + request.params.repository);

	db.one('select id from package where organization = ${organization} and repository = ${repository}', { 
		organization: request.params.organization, 
		repository: request.params.repository
	}).then(function (data) {
		//console.log('pre-existing ' + data.id)
		response.status(200).end();
	}).catch(function (error) {
		var gh = new github({ token: request.user.access_token }, process.env.GITHUB_API);
		var repo = gh.getRepo(request.params.organization, request.params.repository);
		// see if the repository exists
		repo.getDetails().then(function (result) {
			//console.log('found on github ... ' + JSON.stringify(result.data, null, 4));
			// check to see if there's a premake5-ghp.lua file in the root
			repo.getContents('master', 'premake5-ghp.lua').then(function (result) {
				console.log('found on github ... ' + JSON.stringify(result.data, null, 4));
				// install a webhook so we'll be notified when there are new releases
				repo.createHook({ 
					name: 'web', 
					active: true,
					config: { 
						url: base_url + '/api/update',
						content_type: 'json',
					}, 
					events: [ 'release' ] 
				}).then(function (result) {
					db.any('insert into package (organization, repository) values (${organization}, ${repository}) on conflict do nothing', {
						organization: request.params.organization, 
						repository: request.params.repository
					}).then(function (data) {
						response.status(200).end();
					}).catch(function (error) {
						console.log('database insert failed .. ' + error);
						response.status(500).end('Uh oh. Internal server error.');
					});
				}).catch(function (error) {
					console.log('installation of webhook failed .. ' + error);
					response.status(404).end('Hook could not be installed for repository ' + request.params.organization + '/' + request.params.repository + '.');
				});
			}).catch(function (error) {
				console.log('lookup of premake5-ghp.lua failed .. ' + error);
				response.status(404).end('Repository ' + request.params.organization + '/' + request.params.repository + ' does not have premake5-ghp.lua at it\'s root.');
			});
		}).catch(function (error) {
			//console.log('not found in github .. ' + error);
			response.status(404).end('Could not find ' + request.params.organization + '/' + request.params.repository + ' on GitHub.');
		});
	});
});

app.post('/api/update', function (request, response) {

	console.log('received update ' + JSON.stringify(request.body, null, 4));
	if (request.body.release) {
		db.none('update package set updated = now() where organization = ${organization} and repository = ${repository}', {
			organization: request.body.repository.owner.login, 
			repository: request.body.repository.name
		}).then(function (data) {
			response.status(200).end();
		}).catch(function (error) {
			console.log('update of ' + request.body.repository.full_name + ' failed .. ' + error);
			response.status(500).end('Uh oh. Internal server error.');
		});
	}
	else if (request.body.repository) {
		console.log('received repository ping ' + request.body.repository.full_name);
	}
	else {
		console.log('received unhandled update ' + JSON.stringify(request.body));
	}
});

// view a package

getReadme = function (ref, raw, cb) {
	return this._request('GET', `/repos/${this.__fullname}/readme`, {
		ref
	}, cb, raw);
}

app.get('/:organization/:repository', function (request, response) {

	var gh = new github({ token: request.user.access_token }, process.env.GITHUB_API);
	var repo = gh.getRepo(request.params.organization, request.params.repository);

	var data = { user: request.user };

	// extend GitHub API for retrieving README files
	repo.getReadme = getReadme;

	//console.log('viewing ' + repo.__fullname);
	repo.getDetails().then(function (result) {
		data.repo = result.data;
		//console.log('details ' + JSON.stringify(details, null, 4));
		repo.getRelease('latest').then(function (result) {
			data.release = result.data;
			data.release.created_at_fromnow = moment(data.release.published_at).fromNow();
			data.release.published_at_fromnow = moment(data.release.published_at).fromNow();
			//console.log('release: ' + JSON.stringify(release, null, 4));
			repo.getReadme(release.tag_name).then(function (result) {
				data.readme = result.data;
				data.readme.content_html = marked(new Buffer(data.readme.content, 'base64').toString());
				//console.log('readme: ' + JSON.stringify(readme, null, 4));
				response.render('view', data);
			})
			.catch(function (error) {
				//console.log('readme retrieve from ' + release.tag_name + ' failed: ' + error);
				// couldn't get the README from the release, try the readme from master
				repo.getReadme().then(function (result) {
					data.readme = result.data;
					data.readme.content_html = marked(new Buffer(data.readme.content, 'base64').toString());
					//console.log('readme: ' + JSON.stringify(readme, null, 4));
					response.render('view', data);
				}).catch(function (error) {
					//console.log('readme retrieve from master failed: ' + error);
					response.render('view', data);
				});
			});
		}).catch(function (error) {
			//console.log('release retrieve failed: ' + error);

			// try the readme from master
			repo.getReadme().then(function (result) {
				data.readme = result.data;
				data.readme.content_html = marked(new Buffer(data.readme.content, 'base64').toString());
				//console.log('readme: ' + JSON.stringify(readme, null, 4));
				response.render('view', data);
			}).catch(function (error) {
				//console.log('readme retrieve from master failed: ' + error);
				response.render('view', data);
			});
		});
	}).catch(function (error) {
		console.log('repo retrieve failed: ' + error);
		response.status(500).end(error);
	});
});

// remove a package

app.delete('/:organization/:repository', function (request, response) {

	// attempt to remove

	// sucess, redirect to home
	response.redirect('/');
});



//------------------------------------------------------------------------------
// let's do this

var port = process.env.PORT || 5000; //select your port or let it pull from your .env file
app.listen(port);
console.log("listening on " + port + "!");
