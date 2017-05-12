import { version } from '../../package.json';
import { Router } from 'express';
import facets from './facets';
import axios from 'axios';
import  { xml2json } from 'xml-js';
import moment from 'moment';

const GOODREADS_API_KEY = 'TVvN8t1IQNJjWrr3IFVGg';
// const GOODREADS_API_SECRET = 'hJtBaPb5Gqyz14st8M4IUbN05l3oGRJTz23Kr2Vhq7E';
const GOODREADS_BASE_URL = 'https://www.goodreads.com';
const MAX_ITEMS_PER_PAGE = 30;
const ELASTICSEARCH_BASE_URL = 'http://localhost:9200';
const BOOKS_ES_INDEX = 'gr_books';
const BOOK_TYPE = 'book';
const ES_USER = 'elastic';
const ES_PASSWORD = 'changeme';

export default ({ config, db }) => {
	let api = Router();

	// mount the facets resource
	api.use('/facets', facets({ config, db }));

	// perhaps expose some API metadata at the root
	api.get('/', (req, res) => {
		res.json({ version });
	});

	api.get('/authors/search/:author', (req, res) => {
    const url = `${ GOODREADS_BASE_URL }/api/author_url/${ req.params.author }?key=${ GOODREADS_API_KEY }`;
    axios.get(url)
			.then((response) => {
    		const grResp = JSON.parse(xml2json(response.data, { compact: true, spaces: 2 }));
    		const id = grResp.GoodreadsResponse.author._attributes.id;
    		const name = grResp.GoodreadsResponse.author.name._cdata;
    		const author = { id, name };
    		res.send(author);
			})
			.catch((error) => {
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.log(error.response.data);
          console.log(error.response.status);
          console.log(error.response.headers);
        } else if (error.request) {
          // The request was made but no response was received
          // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
          // http.ClientRequest in node.js
          console.log(error.request);
        } else {
          // Something happened in setting up the request that triggered an Error
          console.log('Error', error.message);
        }
        console.log(error.config);
			});
	});

	api.get('/authors/search/allbooks/:authorName', (req, res) => {
    const url = `${GOODREADS_BASE_URL}/api/author_url/${ req.params.authorName }?key=${ GOODREADS_API_KEY }`;
    axios.get(url)
      .then((response) => {
        const grResp = JSON.parse(xml2json(response.data, { compact: true, spaces: 2 }));
        const id = grResp.GoodreadsResponse.author._attributes.id;
        const name = grResp.GoodreadsResponse.author.name._cdata;
        const author = { id, name };
        axios.get(`http://localhost:8080/api/authors/${ author.id }/allbooks`)
					.then((response) => {
        		author.books = response.data;
        		author.book_count = author.books.length;
        		const elasticPromises = [];
        		author.books.forEach((book) => {
        			const elasticUrl = `${ BOOKS_ES_INDEX }/${ BOOK_TYPE }/${ book.id }/_create`;
        			book.author_name = author.name;
              book.author_id = author.id;
              elasticPromises.push(axios({
              	method: 'PUT',
								url: elasticUrl,
								data: book,
                baseURL: `${ ELASTICSEARCH_BASE_URL }/`,
                auth: {
                  username: ES_USER,
                  password: ES_PASSWORD
                },
                // headers: { 'accept': 'application/json' }
							}));
						});
        		axios.all(elasticPromises)
              .then(axios.spread((...args) => {
                for (let i = 0; i < args.length; i++) {
                  console.log(args[i].status);
                }
              }))
              .catch((error) => {
                if (error.response) {
                  // The request was made and the server responded with a status code
                  // that falls out of the range of 2xx
                  console.log(error.response.data);
                  console.log(error.response.status);
                  console.log(error.response.headers);
                } else if (error.request) {
                  // The request was made but no response was received
                  // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                  // http.ClientRequest in node.js
                  console.log(error.request);
                } else {
                  // Something happened in setting up the request that triggered an Error
                  console.log('Error', error.message);
                }
                console.log(error.config);
              });

        		res.send(author);
					});
      });
	});

	api.get('/authors/:id/books/:page', (req, res) => {
    const url = `${GOODREADS_BASE_URL}/author/list/${ req.params.id }?key=${ GOODREADS_API_KEY }&page=${ req.params.page }`;
    axios.get(url)
			.then((response) => {
        const grResp = JSON.parse(xml2json(response.data, { compact: true, spaces: 2 }));
        const author = grResp.GoodreadsResponse.author;
        const books = author.books.book;
        const bookSearchAttrs = grResp.GoodreadsResponse.author.books._attributes;
        const results = {
          author_name: author.name._text,
          books: books
        };
        const { start, end, total } = bookSearchAttrs;
        const answer = {
          start,
          end,
          total,
          results
        };
        res.send(answer);
			})
      .catch((error) => {
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.log(error.response.data);
          console.log(error.response.status);
          console.log(error.response.headers);
        } else if (error.request) {
          // The request was made but no response was received
          // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
          // http.ClientRequest in node.js
          console.log(error.request);
        } else {
          // Something happened in setting up the request that triggered an Error
          console.log('Error', error.message);
        }
        console.log(error.config);
      });
	});

	api.get('/authors/:id/allbooks', (req, res) => {
		let currentPage = 1;
		let morePages = false;
    let books = [];

		let url = `${GOODREADS_BASE_URL}/author/list/${ req.params.id }?key=${ GOODREADS_API_KEY }&page=${ currentPage }`;
		console.log(url);
		const promises = [];
		axios.get(url)
			.then((response) => {
				const grResp = JSON.parse(xml2json(response.data, { compact: true, spaces: 2, nativeType: true }));
				const author = grResp.GoodreadsResponse.author;
				const bookSearchAttrs = grResp.GoodreadsResponse.author.books._attributes;
				const { end, total } = bookSearchAttrs;
				morePages = total > end;
				books = books.concat(author.books.book);

				const numPages = Math.ceil(total/MAX_ITEMS_PER_PAGE);
				const promises = [];
				for(currentPage = 2; currentPage <= numPages; currentPage++) {
          url = `${GOODREADS_BASE_URL}/author/list/${ req.params.id }?key=${ GOODREADS_API_KEY }&page=${ currentPage }`;
					promises.push(axios.get(url));
				}
				axios.all(promises)
					.then(axios.spread((...args) => {
            for (let i = 0; i < args.length; i++) {
              const grResp = JSON.parse(xml2json(args[i].data, { compact: true, spaces: 2, nativeType: true  }));
              const author = grResp.GoodreadsResponse.author;
              const bookSearchAttrs = grResp.GoodreadsResponse.author.books._attributes;
              const { end, total } = bookSearchAttrs;
              morePages = total > end;
              books = books.concat(author.books.book);
            }

            books = books.map((book) => {
            	const pubMonth = book.publication_month._text < 10 ? "0" + book.publication_month._text : book.publication_month._text;
            	let pubDay = book.publication_day._text || 1;
            	const pubYear = book.publication_year._text
              pubDay = pubDay < 10 ? "0" + pubDay : pubDay;
            	let publicationDate = null;
              if(!pubMonth || !pubYear) {
                publicationDate = moment().format('YYYY-MM-DD');
							} else {
                publicationDate = `${ pubYear }-${ pubMonth }-${ pubDay }`;
              }
            	return {
            		id: book.id._text,
								isbn: book.isbn._text,
                isbn13: book.isbn13._text,
								title: book.title._text,
								title_without_series: book.title_without_series._text,
								image_url: book.image_url._text,
								gr_link: book.link._text,
								num_pages: book.num_pages._text,
								format: book.format._text,
								description: book.description._text,
								publisher: book.publisher._text,
								publication_date: publicationDate
							};
						});
            res.send(books);
					}));
			});
	});

	return api;
}
