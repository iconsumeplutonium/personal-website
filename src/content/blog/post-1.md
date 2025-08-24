---
title: 'From the makings of WikiGlobe'
date: '08-20-2025'
description: tbd
---

So the idea behind the project is pretty simple. Every Wikipedia article about a location has its geographic coordinates on it. I wanted to grab every single one of those articles, and project it onto a globe, and see what I can get. Sounds simple enough. How hard can it be? 

### The Wikipedia API
 
Wikipedia, like most online wikis, uses [MediaWiki](https://www.mediawiki.org/wiki/MediaWiki) as their underlying software, which has an [API](https://www.mediawiki.org/wiki/API), so my first thought was to query it. With a bit of digging, I found that there is a [`&prop=coordinates` parameter](https://www.mediawiki.org/wiki/Extension:GeoData#prop=coordinates) that can be passed to the API to get the coordinates for a specified article. So the query string to get the coordinates for a given article is 

```
/api.php ?action=query &prop=coordinates &format=json &titles=[article titles]

```

For instance, [this](https://en.wikipedia.org/w/api.php?action=query&prop=coordinates&format=json&titles=Big%20Ben) is the API call to get the coordinates of the Big Ben article.

So now that I know how to get the coordinates of a given article, I needed a way to get *all* articles with coordinates. Wikipedia has all sorts of [categories](https://en.wikipedia.org/wiki/Wikipedia:Contents/Categories) to group different types of articles by topic, from general categories like History and Technology, to really specific categories, like [Category:All Articles with unsourced statements](https://en.wikipedia.org/wiki/Category:All_articles_with_unsourced_statements), or [Category:Protected areas of California without parameters](https://en.wikipedia.org/wiki/Category:Protected_areas_of_California_articles_without_parameters). You can view what categories an article belongs to by going to `Tools > Page Information`, so I opened up a random article about a location and read through all the categories until I found what I was looking for: [Category:Coordinates on WikiData](https://en.wikipedia.org/wiki/Category:Coordinates_on_Wikidata). Now, using another MediaWiki API call, I could extract a list of all category members and their titles using the [generator prop](https://www.mediawiki.org/wiki/API:Query#:~:text=Get%20the%20list%20of%20pages%20to%20work%20on%20by%20executing%20the%20specified%20query%20module). The query string is as follows:

```
api.php ?action=query &generator=categorymembers &gcmtitle=Category:Coordinates_on_Wikidata &gcmlimit=max &prop=coordinates &format=json
```

which returns [this](https://en.wikipedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:Coordinates_on_Wikidata&gcmlimit=max&prop=coordinates&format=json).


<div class="center">
  <img class="pro-img" src="/images/categoryapicall.png" alt="The results of the API call" width="300px" height="auto" loading="lazy" decoding="async">
</div>

Beautiful. 

Now one thing to note about MediaWiki API calls is that if the response is too large, it'll *paginate* the API. Essentially, if the `cocontinue` parameter is part of the response, then that's the API telling us, "hey, there's more data to be returned in response to your query". To get the next batch of results, you simply take the previous query and adding `&cocontinue=[whatever the API returned]` to the end. The amount of results returned per batch is determined by the `&gcmlimit=` parameter in the URL, which I set to `max`, or 500 results at a time. Hmm, I wonder how many articles are part of the "Coordinates on WikiData" article?

<div class="center">
  <img class="pro-img" src="/images/total_coordinates.png" alt="The total number of articles on the site" width="600px" height="auto" loading="lazy" decoding="async">
</div>

That means it'll take around 2,400 API calls to fully get every single article with its coordinates. Not ideal at all, but probably better than webscraping all 1.2 million articles, so I decided to go ahead with it anyways. But, wait a minute, what's this?

<div class="center">
  <img class="pro-img" src="/images/first10.png" alt="Only the first 10 have APIs" width="600px" height="auto" loading="lazy" decoding="async">
</div>

For some reason, the generator prop only returns the coordinates *for the first 10 articles of the API response!* That means the amount of API calls needed to be made goes from 2,400 to over 120,000, which is unacceptably large and would probably get me IP banned from Wikipedia (and take hours to complete). I needed to find another way. I briefly experimented with [WikiData's Query Service](https://query.wikidata.org/), which lets you make SPARQL queries on Wikipedia's data. This also proved fruitless as the request would time out before completing (it is 1.2 million articles after all). I needed to find another way.

### WikiData Dumps

So if querying the specific data I needed data over the network via an API is out of the question, my next idea was a real simple one: just download Wikipedia. 

It's not actually as farfetched as it seems. Wikipedia provides ways to download all of their articles for offline access, and it isn't that much larger than a modern AAA video game. English Wikipedia with only text is 58GB, and around 100GB with all media ([source](https://en.wikipedia.org/wiki/Wikipedia:Statistics#Statistics_by_namespace)). I've even known a few people in real life who like to keep offline copies of Wikipedia on their device. Now the most common way to download Wikipedia is to use a program called [Kiwix](https://kiwix.org/en/). Once installed, you can download Wikipedia in one click, and use the software to browse it locally, just like you would in a web browser. After looking into this route, the main issue with that is that it doesn't download the articles as regular HTML files, it stores it as one very large 100GB file in the `.zim` file format, which I had never heard of. As I looked into it more, I discovered that Wikipedia also provides its data in SQL and XML formats [here](https://dumps.wikimedia.org/enwiki/) ([source](https://en.wikipedia.org/wiki/Wikipedia:Database_download#Where_do_I_get_the_dumps?)). This was a very useful discovery, as now I could simply run SQL queries against the database to get the data I needed, without downloading articles that I didn't care about.

There is a *lot* of data on that page, but there are only two that I need. Specifically `enwiki-latest-page.sql.gz` (which contains things like the page title and ID) and `enwiki-latest-geo_tags.sql.gz` (which contains page ID, latitude, and longitude data). The former is 2.3GB compressed and 7GB uncompressed, while the latter is 50MB compressed and 262MB when uncompressed. A significant improvement over the 100GB from before!

Now after downloading and unzipping the data, I began the process of importing both into MariaDB. I first decided to start with `enwiki-latest-page.sql`.

```
sudo mysql -u root -p -e "CREATE DATABASE wikipedia;"
sudo mysql -u root -p wikipedia < enwiki-latest-page.sql
```

After I ran the second command, it just hung. Opening another terminal window and running 

```
sudo mysql -e "SHOW PROCESSLIST;"
```

I could see that it was slowly importing each page, so I decided to leave and wait. Now after about 4 hours of waiting, it had only gotten around to importing the page with the page ID of around 19,000,000. A query to the Wikipedia API told me that the highest page ID on the site was over 60,000,000. I didn't want to wait around that long, so I decided to cancel the import and I turned my focus to `enwiki-latest-geo_tags.sql`.

```
sudo mysql -u root -p -e "DROP DATABASE wikipedia;"
sudo mysql -u root -p -e "CREATE DATABASE wikipedia;"
sudo mysql -u root -p wikipedia < enwiki-latest-geo_tags.sql
```

Luckily this one took significantly less time, only about 20 minutes. Time to take a look inside.

```bash
> sudo mysql
Welcome to the MariaDB monitor.  Commands end with ; or \g.
Your MariaDB connection id is 33
Server version: 10.6.22-MariaDB-0ubuntu0.22.04.1 Ubuntu 22.04

Copyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

MariaDB [(none)]> USE wikipedia;
Reading table information for completion of table and column names
You can turn off this feature to get a quicker startup with -A

Database changed
```

Taking a look at the schema:

```sql
MariaDB [wikipedia]> DESCRIBE geo_tags;
+------------+------------------+------+-----+---------+----------------+
| Field      | Type             | Null | Key | Default | Extra          |
+------------+------------------+------+-----+---------+----------------+
| gt_id      | int(10) unsigned | NO   | PRI | NULL    | auto_increment |
| gt_page_id | int(10) unsigned | NO   | MUL | NULL    |                |
| gt_globe   | varbinary(32)    | NO   |     | NULL    |                |
| gt_primary | tinyint(1)       | NO   |     | NULL    |                |
| gt_lat     | decimal(11,8)    | YES  |     | NULL    |                |
| gt_lon     | decimal(11,8)    | YES  |     | NULL    |                |
| gt_dim     | int(11)          | YES  |     | NULL    |                |
| gt_type    | varbinary(32)    | YES  |     | NULL    |                |
| gt_name    | varbinary(255)   | YES  |     | NULL    |                |
| gt_country | binary(2)        | YES  |     | NULL    |                |
| gt_region  | varbinary(3)     | YES  |     | NULL    |                |
| gt_lat_int | smallint(6)      | YES  |     | NULL    |                |
| gt_lon_int | smallint(6)      | YES  |     | NULL    |                |
+------------+------------------+------+-----+---------+----------------+
13 rows in set (0.001 sec)
```

This seems promising. According to the Category page from earlier, there are around 1.2 million articles with coordinates. Let's first test to make sure that there are 1.2 million articles here.

```sql
MariaDB [wikipedia]> SELECT COUNT(*) FROM geo_tags;
+----------+
| COUNT(*) |
+----------+
|  2677510 |
+----------+
1 row in set (0.892 sec)
```

That's not good. There are over twice as many articles in this database than there should be. Let me first try grabbing the page ID of the article with the lowest page ID, and see how many listings it has in the DB.

```sql
MariaDB [wikipedia]> SELECT gt_page_id FROM geo_tags LIMIT 1;
+------------+
| gt_page_id |
+------------+
|        303 |
+------------+
1 row in set (0.001 sec)

MariaDB [wikipedia]> SELECT gt_page_id,gt_lat,gt_lon FROM geo_tags WHERE gt_page_id = 303;
+------------+-------------+--------------+
| gt_page_id | gt_lat      | gt_lon       |
+------------+-------------+--------------+
|        303 | 34.71361111 | -86.58611111 |
|        303 | 33.65333333 | -86.80888889 |
|        303 | 32.36166667 | -86.27916667 |
|        303 | 30.69444444 | -88.04305556 |
|        303 | 33.00000000 | -87.00000000 |
+------------+-------------+--------------+
5 rows in set (0.000 sec)
```

So as it turns out each article can have *multiple* sets of coordinates associated with it. Visiting article 303, which is the Wikipedia page for [Alabama](https://en.wikipedia.org/wiki/Alabama), there is only one set of coordinates in the top right of the article, which means clearly there must be some way to distinguish the main set of coordinates. Looking at the schema again, there's an attribute called `gt_primary` that can never be null. That seems promising. Let's try that. 

```sql
MariaDB [wikipedia]> SELECT gt_page_id,gt_lat,gt_lon,gt_primary FROM geo_tags WHERE gt_page_id = 303;
+------------+-------------+--------------+------------+
| gt_page_id | gt_lat      | gt_lon       | gt_primary |
+------------+-------------+--------------+------------+
|        303 | 34.71361111 | -86.58611111 |          0 |
|        303 | 33.65333333 | -86.80888889 |          0 |
|        303 | 32.36166667 | -86.27916667 |          0 |
|        303 | 30.69444444 | -88.04305556 |          0 |
|        303 | 33.00000000 | -87.00000000 |          1 |
+------------+-------------+--------------+------------+
5 rows in set (0.001 sec)
```

Would you look at that, only one set of coordinates happens to have `gt_primary` as 1. With a statistically significant sample size of one article, I can conclude that this must be true for all articles. I can test it by running the count query again, but only counting coordinates where `gt_primary` is 1.

```sql
MariaDB [wikipedia]> SELECT COUNT(*) FROM geo_tags WHERE gt_primary = 1;
+----------+
| COUNT(*) |
+----------+
|  1247084 |
+----------+
1 row in set (0.525 sec)
```

1.2 million, just like the Category page said. The number doesn't match one to one, but that page did say that their number might not be accurate, so this is good enough. 

Now to create the visualization, the three primary attributes I'm interested in are `gt_page_id` (so I can pull article informaton on click), `gt_lat`, and `gt_lon`. To make it simple for now, I'll just dump all of these into one really big text file, and parse that on page load. Later, I'll focus on compressing the data properly to reduce network traffic.

```bash
sudo mysql -e "SELECT gt_page_id,gt_lat,gt_lon FROM geo_tags WHERE gt_primary = 1;" wikipedia > coords.txt
```

### Projecting to a Globe

To render the points in my browser, I'll be using Three.js (using WebGL would be pretty fun, but I don't want to go through the process of implementing my own orbit controls). Latitude and longitude are angles, and we need to convert them to a position in 3D space, so we can use the formula for converting spherical coordinates into Cartesian coordinates, using latitude as $\theta$, longitude as $\phi$, and any arbitrary value for the radius. In the code, that looks something like this.

```js
for (let i = 0; i < numRowsInCoordinateData; i++) {
	const r = globeScale;
	const latitude = lats[i] * Math.PI / 180;
	const longitude = lons[i] * Math.PI / 180;

	const x = r * Math.sin(latitude) * Math.cos(longitude);
	const y = r * Math.sin(latitude) * Math.sin(longitude);
	const z = r * Math.cos(latitude);

	processedCoords.push(new Vector3(x, y, z));
}
```

After running that, we end up with this:

<div class="center">
  <img class="pro-img" src="/images/messedupprojection.png" alt="Half-hemisphere of points, all messed up" width="600px" height="auto" loading="lazy" decoding="async">
</div>
<div class="center">
  <img class="pro-img" src="/images/messedupprojection_topview.png" alt="Half-hemisphere of points, all messed up, top view" width="600px" height="auto" loading="lazy" decoding="async">
</div>

The points near the poles are heavily distorted, and there is only one hemisphere of points. A bit of googling led me to [this](https://stackoverflow.com/a/1185413) Stack Overflow post with the correct formula. At the time, I didn't understand why this worked and just blindy followed it, but during the process of writing this post, I decided to go back and try to understand it. If you're interested, you can read the following addendum for an explanation, or skip ahead to see it working.









<details>
<summary>Interlude: Spherical coordinates</summary>

Here is my tenuous understanding of how this works, I'm not quite sure how correct this is.

In spherical coordinates, $\theta$ goes from $0$ at the "north pole" to $\pi$ at the "south pole", but latitude is measured from to 90° at the North pole ($\frac{\pi}{2}$) to -90° at the South Pole (-$\frac{\pi}{2}$). So in other words, we need to map the range $[\frac{\pi}{2}, -\frac{\pi}{2}]$ to $[0, \pi]$. To do so, we can use the formula

$$
\theta = \frac{\pi}{2} - \text{latitude}
$$

Testing it out, it indeed maps $[\frac{\pi}{2}, -\frac{\pi}{2}]$ to $[0, \pi]$

$$
\text{North pole} \Rightarrow \frac{\pi}{2} - \frac{\pi}{2} = 0
$$

$$
\text{South pole} \Rightarrow \frac{\pi}{2} - (-\frac{\pi}{2}) = \pi
$$

Substituting this new formula into the code, we now get this:

```js
const x = r * Math.sin((Math.PI / 2) - latitude) * Math.cos(longitude);
const y = r * Math.sin((Math.PI / 2) - latitude) * Math.sin(longitude);
const z = r * Math.cos((Math.PI / 2) - latitude);
```

From here, we can simplify the formula by using the trigonometric identities known as the *co-function identities* which state

$$
\sin(\frac{\pi}{2} -  \theta) = \cos(\theta)
$$

$$
\cos(\frac{\pi}{2} -  \theta) = \sin(\theta)
$$

```js
const x = r * Math.cos(latitude) * Math.cos(longitude);
const y = r * Math.cos(latitude) * Math.sin(longitude);
const z = r * Math.sin(latitude);
```

which corroborates that Stack Overflow post from earlier.
</details>

















<div class="center">
  <img class="pro-img" src="/images/correctglobe_seethrough.png" alt="Half-hemisphere of points, all messed up, top view" width="600px" height="auto" loading="lazy" decoding="async">
</div>

Its hard to see in the image, but after plugging in the updated formula the globe is now correct. and you can see the shape of the continents. Applying a custom shader to hide points that shouldn't be visible yields this:


<div class="center">
	<video width="600" height="auto" controls autoplay muted loop style="max-width: 100%">
		<source src="/globe.mp4" type="video/mp4" />
		Your browser does not support the video tag.
	</video>
</div>





Another cool thing that can be done is that if I forgo the spherical to Cartesian conversion, and just treat latitude and longitude as regular Cartesian coordinates directly, I end up with a flat, Mercator projection of the whole planet.

```js
const v = new Vector3(lats[i], lons[i], 0).multiplyScalar(flatMapScale); // scale it by some arbirary value
processedCoords.push(v);
```

<div class="center">
  <img class="pro-img" src="/images/mercator.png" alt="Half-hemisphere of points, all messed up, top view" width="600px" height="auto" loading="lazy" decoding="async">
</div>


### Filtering out non-articles

As I progressed through this project, I added the ability to click on points and view the associated Wikipedia article. This led to me discovering that there existed pages on Wikipedia that have geographic coordiantes, but aren't articles. For instance, I discovered a point at 0°N 90°W associated with [this](https://en.wikipedia.org/?curid=17458267) page, which appears to belong to a user. I needed a way to filter out all the points that weren't articles. Where would I get that information? Well, it turns out that information is back in `enwiki-latest-pages.sql`, that 7GB SQL file that wasn't even halfway done after 4 hours of importing. According to the [schema](https://www.mediawiki.org/wiki/Manual:Page_table#page_namespace), the `page_namespace` column would tell me if an page was an article or not. 

(Now it was at this point that I got distracted and discovered that the `enwiki-latest-geo_tags.sql` table from earlier had coordinates for planets *other than Earth!* If you want to read more about that, check out the following addendum.)

<details>
<summary>Addendum: gt_globe and other celestial bodies</summary>

After looking at the schema for the geotags DB again, I noticed that there was a column called `gt_globe` that could not be null, i.e. it must be present for every single set of coordinates. I ran it for the first 10 set of coordinates

```sql
MariaDB [wikipedia]> select gt_globe from geo_tags limit 10;
+----------+
| gt_globe |
+----------+
| earth    |
| earth    |
| earth    |
| earth    |
| earth    |
| earth    |
| earth    |
| earth    |
| earth    |
| earth    |
+----------+
10 rows in set (0.011 sec)
```

*Aren't all of these coordinates for Earth? what's the point of this column?*, I thought. So I decided to grab every single `gt_globe` and its count.

```sql
MariaDB [wikipedia]> SELECT gt_globe,COUNT(*) FROM geo_tags GROUP BY gt_globe ORDER BY COUNT(*) DESC;
+------------+----------+
| gt_globe   | COUNT(*) |
+------------+----------+
| earth      |  2663854 |
| moon       |     4743 |
| mars       |     3119 |
| venus      |     1201 |
| mercury    |      942 |
| titan      |      446 |
| ganymede   |      347 |
| callisto   |      301 |
| io         |      301 |
| vesta      |      296 |
| ceres      |      211 |
| dione      |      168 |
| iapetus    |      137 |
| eros       |      117 |
| europa     |      111 |
| tethys     |      108 |
| rhea       |      105 |
| enceladus  |      102 |
| gaspra     |       97 |
| ez         |       94 |
| lutetia    |       75 |
| pluto      |       61 |
| titania    |       56 |
| phoebe     |       51 |
| ariel      |       49 |
| ida        |       48 |
| phobos     |       44 |
| mimas      |       38 |
| itokawa    |       37 |
| oberon     |       32 |
| umbriel    |       30 |
| charon     |       24 |
| miranda    |       23 |
| mathilde   |       23 |
| steins     |       23 |
| triton     |       23 |
| hyperion   |       11 |
| deimos     |        8 |
| jupiter    |        7 |
| dactyl     |        4 |
| proteus    |        3 |
| amalthea   |        2 |
| thebe      |        2 |
| janus      |        1 |
| adrastea   |        1 |
| puck       |        1 |
| cordelia   |        1 |
| atlas      |        1 |
| luna       |        1 |
| galatea    |        1 |
| juliet     |        1 |
| telesto    |        1 |
| marás      |        1 |
| neptune    |        1 |
| ophelia    |        1 |
| prometheus |        1 |
| golevka    |        1 |
| larissa    |        1 |
| portia     |        1 |
| calypso    |        1 |
| naiad      |        1 |
| bianca     |        1 |
| pandora    |        1 |
| borrelly   |        1 |
| rosalind   |        1 |
| helene     |        1 |
| saturn     |        1 |
| sun        |        1 |
| thalassa   |        1 |
| cressida   |        1 |
| epimetheus |        1 |
| metis      |        1 |
| belinda    |        1 |
| uranus     |        1 |
| pan        |        1 |
| terra      |        1 |
| despina    |        1 |
| test       |        1 |
| desdemona  |        1 |
+------------+----------+
79 rows in set (2.976 sec)
```

Huh. 

I was curious as to what some of these bodies were, as I had never heard of any place named `test`. As it turns out, a lot of the celestial bodies don't have an associated article. Most of them are from page with an ID of 22123904 ([Template:Coord/testcases](https://en.wikipedia.org/?curid=22123904)) and 55067190 [(Wikipedia talk:Coordinates in infoboxes/Archive 2](https://en.wikipedia.org/?curid=55067190)). Filtering these two out gives us a better picture of the available coordinates (I'm sure there's more such articles, but I'll dig into that later).

```sql
MariaDB [wikipedia]> SELECT gt_globe,COUNT(*) FROM geo_tags WHERE gt_page_id != 22123904 AND gt_page_id != 55067190 GROUP BY gt_globe ORDER BY COUNT(*) DESC;
+-----------+----------+
| gt_globe  | COUNT(*) |
+-----------+----------+
| earth     |  2663735 |
| moon      |     4738 |
| mars      |     3114 |
| venus     |     1199 |
| mercury   |      940 |
| titan     |      445 |
| ganymede  |      346 |
| callisto  |      300 |
| io        |      300 |
| vesta     |      295 |
| ceres     |      210 |
| dione     |      167 |
| iapetus   |      136 |
| eros      |      116 |
| europa    |      110 |
| tethys    |      107 |
| rhea      |      104 |
| enceladus |      101 |
| gaspra    |       96 |
| ez        |       94 |
| lutetia   |       75 |
| pluto     |       60 |
| titania   |       55 |
| phoebe    |       50 |
| ariel     |       48 |
| ida       |       47 |
| phobos    |       43 |
| mimas     |       37 |
| itokawa   |       37 |
| oberon    |       31 |
| umbriel   |       29 |
| steins    |       23 |
| mathilde  |       23 |
| charon    |       23 |
| miranda   |       22 |
| triton    |       22 |
| hyperion  |       10 |
| deimos    |        7 |
| jupiter   |        6 |
| dactyl    |        4 |
| proteus   |        2 |
| marás     |        1 |
| amalthea  |        1 |
| thebe     |        1 |
+-----------+----------+
44 rows in set (2.459 sec)
```

</details>