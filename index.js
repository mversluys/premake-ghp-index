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

var base_url = 'http://www.premake-ghp.com';

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
		callbackURL: base_url + '/api/auth-callback',
		authorizationURL: process.env.GITHUB_OAUTH ? process.env.GITHUB_OAUTH + '/authorize' : undefined,
		tokenURL: process.env.GITHUB_OAUTH ? process.env.GITHUB_OAUTH + '/access_token' : undefined,
		userProfileURL: process.env.GITHUB_API ? process.env.GITHUB_API + '/user' : undefined,
		userEmailURL: process.env.GITHUB_API ? process.env.GITHUB_API + '/user/emails' : undefined
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

// main pages

app.get('/', function (request, response) {

	Promise.all([
		db.one('select count(*) from package'),
		db.any('select organization, repository, description, latest_release, stargazers, watchers, updated from package order by updated desc limit 9')
	]).then(function (results) {
		var count = results[0];
		var recent = results[1];
		for (var i = 0; i < recent.length; ++i) {
			recent[i].updated_fromnow = moment(recent[i].updated).fromNow();
		}
		response.render('home', { user: request.user, count: count.count, recent: recent });
	}).catch(function (error) {
		console.log('retrieving information from the database failed ' + error);
		response.status(500).end('Uh oh. Internal server error.');
	});
});

function search(request, response, query) {
	db.any('select organization, repository, description, latest_release, updated, stargazers, watchers from package where organization ilike ${query} or repository ilike ${query} or description ilike ${query} order by stargazers desc, watchers desc, organization asc, repository asc limit 20', {
		query: '%' + query.replace('%', '%%') + '%'
	}).then(function (results) {
		for (var i = 0; i < results.length; ++i) {
			results[i].updated_fromnow = moment(results[i].updated).fromNow();
		}
		response.render('search', { user: request.user, query: query, results: results });
	}).catch(function (error) {
		console.log('searching the database failed ' + error);
		response.status(500).end('Uh oh. Internal server error.');
	});
}

app.get('/search', function (request, response) {
	if (request.query.q) {
		search(request, response, request.query.q);
	}
	else {
		response.render('search', { user: request.user, error: 'expected a search query term' });
	}	
});

app.get('/search/:query', function (request, response) {
	if (request.params.query) {
		search(request, response, request.params.query);
	}
	else {
		response.render('search', { user: request.user, error: 'expected a search query term' });
	}	
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

function get_day(date) {
	//console.log('get day ' + date);
	return new Promise(function (resolve, reject) {
		db.one('select id from day where date = ${date}', { 
			date: date
		}).then(function (day) {
			//console.log('resolved day ' + day.id);
			resolve(day.id);
		}).catch(function (error) {
			//console.log('failed to select day ' + error);
			db.one('insert into day (date, day_of_week, day, month, year) values (${date}, ${day_of_week}, ${day}, ${month}, ${year}) returning id', {
				date: date,
				day: date.getTime() / 1000 / 60 / 60 / 24,
				day_of_week: date.getDay(),
				month: date.getMonth(),
				year: date.getFullYear()
			}).then(function (day) {
				//console.log('created day ' + date);
				resolve(day.id);
			}).catch(function (error) {
				console.log('failed to create day ' + error);
				reject(error);
			});
		});
	});
}

function get_release(package, release) {
	//console.log('get release %s %s', package, release);
	return new Promise(function (resolve, reject) {
		db.one('select id from release where package = ${package} and release = ${release}', { 
			package: package,
			release: release
		}).then(function (release) {
			//console.log('resolved release ' + release.id);
			resolve(release.id);
		}).catch(function (error) {
			//console.log('failed to select release ' + error);
			db.one('insert into release (package, release) values (${package}, ${release}) returning id', {
				package: package,
				release: release,
			}).then(function (release) {
				//console.log('created release ' + release.id);
				resolve(release.id);
			}).catch(function (error) {
				console.log('failed to create release ' + error);
				reject(error);
			});
		});
	});
}

function get_consumer(organization, repository) {
	//console.log('get consumer %s %s', organization, repository);
	return new Promise(function (resolve, reject) {
		db.one('select id from consumer where organization = ${organization} and repository = ${repository}', { 
			organization: organization,
			repository: repository
		}).then(function (consumer) {
			//console.log('resolved consumer ' + consumer.id);
			resolve(consumer.id);
		}).catch(function (error) {
			//console.log('failed to select consumer ' + error);
			db.one('insert into consumer (organization, repository) values (${organization}, ${repository}) returning id', {
				organization: organization,
				repository: repository,
			}).then(function (consumer) {
				//console.log('created consumer ' + consumer.id);
				resolve(consumer.id);
			}).catch(function (error) {
				console.log('failed to create consumer ' + consumer.id);
				reject(error);
			});
		});
	});
}

app.get('/api/use/:organization/:repository/:release', function (request, response) {
	var organization = request.params.organization;
	var repository = request.params.repository;
	var release = request.params.release;
	var consumer = request.query.consumer.split('/', 2);

	console.log('use %s %s %s %s', organization, repository, release, consumer);

	db.one('select id from package where organization = ${organization} and repository = ${repository}', {
		organization: organization,
		repository: repository
	}).then(function (package) {

		var date = new Date();
		date.setUTCHours(0, 0, 0, 0);

		Promise.all([
			get_day(date),
			get_release(package.id, release),
			get_consumer(consumer[0], consumer[1])
		]).then(function (results) {
			var day = results[0];
			var release = results[1];
			var consumer = results[2];
			var downloaded = request.query.cached ? 0 : 1;
			var cached = request.query.cached ? 1 : 0;
			//console.log('updating %s %s %s %s %s', day, release, consumer, downloaded, cached);
			db.none('insert into usage (day, release, consumer, downloaded, cached) \
					values (${day}, ${release}, ${consumer}, ${downloaded}, ${cached}) \
					on conflict (day, release, consumer) do update \
					set downloaded = usage.downloaded + ${downloaded}, cached = usage.cached + ${cached}', {
				day: day,
				release: release,
				consumer: consumer,
				downloaded: downloaded,
				cached: cached
			}).then(function (results) {
				//console.log('updated usage');
				response.status(200).end();
			}).catch(function (error) {
				console.log('usage insert/update failed ' + error);
				response.status(500).end('usage insert/update failed ' + error);
			});

		}).catch(function (error) {
			response.status(500).end('looking up day/release/consumer failed ' + error);
		});
	}).catch(function (error) {
		// no such package?
		response.status(404).end();
	});
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
			var details = result.data;
			//console.log('found on github ... ' + JSON.stringify(result.data, null, 4));
			// check to see if there's a premake5-ghp.lua file in the root
			repo.getContents('master', 'premake5-ghp.lua').then(function (result) {
				//console.log('found on github ... ' + JSON.stringify(result.data, null, 4));

				// check to see if there's a release
				repo.getRelease('latest').then(function (result) {
					var release = result.data;

					// look to see if there's a webhook
					repo.listHooks().then(function (result) {
						console.log('found hooks ' + JSON.stringify(result.data, null, 4));

						function add() {
							db.any('insert into package (organization, repository, description, latest_release, stargazers, watchers, updated) values (${organization}, ${repository}, ${description}, ${latest_release}, ${stargazers}, ${watchers}, ${updated}) on conflict do nothing', {
								organization: request.params.organization, 
								repository: request.params.repository,
								description: details.description,
								latest_release: release.tag_name,
								stargazers: details.stargazers_count,
								watchers: details.subscribers_count,
								updated: release.published_at
							}).then(function (data) {
								response.status(200).end();
							}).catch(function (error) {
								console.log('database insert failed .. ' + error);
								response.status(500).end('Uh oh. Internal server error.');
							});
						}

						var hook = null;

						// look to see if our hook was installed
						for (var i = 0; i < result.data.length; ++i) {
							var h = result.data[i];
							if (h.config && h.config.url == base_url + '/api/update' && h.config.content_type == 'json') {
								console.log('our hook was already installed!');
								hook = h;
							}
						}

						if (!!hook) {
							add();
						} else {
							// couldn't find it, try to install a new one
							repo.createHook({ 
								name: 'web', 
								active: true,
								config: { 
									url: base_url + '/api/update',
									content_type: 'json',
								}, 
								events: [ 'release' ] 
							}).then(function (result) {
								add();
							}).catch(function (error) {
								console.log('installation of webhook failed .. ' + error);
								response.status(404).end('Hook could not be installed for repository ' + request.params.organization + '/' + request.params.repository + '.');
							});
						}
					}).catch(function (error) {
						console.log('could not retrieve hooks .. ' + error);
						response.status(404).end('You don\'t have access to the hooks for repository ' + request.params.organization + '/' + request.params.repository + '.');
					});
				}).catch(function (error) {
					//console.log('lookup of release failed .. ' + error);
					response.status(404).end('Repository ' + request.params.organization + '/' + request.params.repository + ' does not have a latest release.');
				});
			}).catch(function (error) {
				//console.log('lookup of premake5-ghp.lua failed .. ' + error);
				response.status(404).end('Repository ' + request.params.organization + '/' + request.params.repository + ' does not have premake5-ghp.lua at it\'s root.');
			});
		}).catch(function (error) {
			//console.log('not found in github .. ' + error);
			response.status(404).end('Could not find ' + request.params.organization + '/' + request.params.repository + ' on GitHub.');
		});
	});
});

// TOOD: this needs to be secured (using the secret and verification) or don't trust the data that's been supplied
app.post('/api/update', function (request, response) {
	//console.log('received update ' + JSON.stringify(request.body, null, 4));
	if (request.body.release) {
		db.none('update package set updated = ${updated}, latest_release = ${latest_release}, description = ${description}, stargazers = ${stargazers}, watchers = ${watchers} where organization = ${organization} and repository = ${repository}', {
			organization: request.body.repository.owner.login, 
			repository: request.body.repository.name,
			description: request.body.repository.description,
			stargazers: request.body.repository.stargazers_count,
			watchers: request.body.repository.subscribers_count,
			latest_release: request.body.release.tag_name,
			updated: request.body.release.published_at
		}).then(function (data) {
			response.status(200).end();
		}).catch(function (error) {
			console.log('update of ' + request.body.repository.full_name + ' failed .. ' + error);
			response.status(500).end('Uh oh. Internal server error.');
		});
	}
	else if (request.body.repository) {
		console.log('received repository ping ' + request.body.repository.full_name);
		response.status(200).end();
	}
	else {
		console.log('received unhandled update ' + JSON.stringify(request.body));
		response.status(400).end();
	}
});

// view a package

getReadme = function (ref, raw, cb) {
	return this._request('GET', `/repos/${this.__fullname}/readme`, {
		ref
	}, cb, raw);
}

app.get('/:organization/:repository', function (request, response) {

	var gh;
	if (request.user && request.user.access_token) {
		gh = new github({ token: request.user.access_token }, process.env.GITHUB_API);
	} 
	else {
		gh = new github({}, process.env.GITHUB_API);
	}

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

		error = [];
		error.push('Unable to retrieve information about repository ' + request.params.organization + '/' + request.params.repository + '.'); 
		if (request.user) {
			error.push('You account doesn\'t have access to this repository, or perhaps it doesn\'t exist.');
		} 
		else {
			error.push('This repository may require authentication, try logging in.');
		}
		response.render('view', { user: request.user, error: error }); 
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
