-- database schema

-- day table allowing for slicing based on day

create table day (
	id serial primary key,
	date date unique not null,
	day_of_week integer not null,
	day integer not null,
	month integer not null,
	year integer not null);

create index day_day_of_week_idx on day(day_of_week);
create index day_day_idx on day(day);
create index day_month_idx on day(month);
create index day_year_idx on day(year);

-- packages

create table package (
	id serial primary key,
	organization text not null,
	repository text not null,
	created timestamp not null default current_timestamp,
	updated timestamp not null default current_timestamp,
	unique(organization, repository));	

create index package_organization_idx on package(organization);

-- labels (for the future)

create table label (
	id serial primary key,
	label text unique not null);

create table package_label (
	id serial primary key,
	package integer references package(id) on delete cascade,
	label integer references label(id) on delete cascade);

-- releases

create table release (
	id serial primary key,
	package integer references package(id) on delete cascade,
	release text not null,
	unique(package, release));

-- consumer

create table consumer (
	id serial primary key,
	organization text not null,
	repository text not null,
	unique(organization, repository));

-- usage fact table

create table usage (
	day integer references day(id) on delete cascade,
	release integer references release(id) on delete cascade,
	consumer integer references consumer(id) on delete cascade,
	downloaded integer not null default 0,
	cached integer not null default 0);
