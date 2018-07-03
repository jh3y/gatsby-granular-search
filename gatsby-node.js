const _ = require('lodash')
const Promise = require('bluebird')
const path = require('path')
const { createFilePath } = require('gatsby-source-filesystem')
const elasticlunr = require('elasticlunr')
const { GraphQLScalarType } = require('graphql')
const unified = require('unified')
const markdown = require('remark-parse')
const html = require('remark-html')
const JSDOM = require('jsdom').JSDOM
const parent = '___SOURCE___'
const SEARCH_INDEX_ID = 'SiteSearchIndex < Site'
const SEARCH_INDEX_TYPE = 'SiteSearchIndex'
const SearchIndex = new GraphQLScalarType({
  name: `${SEARCH_INDEX_TYPE}_Index`,
  parseValue() {
    throw new Error('Not Supported')
  },
  serialize(value) {
    return value
  },
  parseLiteral() {
    throw new Error('Not Supported')
  },
})
const createEmptySearchIndexNode = () => ({
  id: SEARCH_INDEX_ID,
  parent,
  children: [],
  pages: [],
})

const appendPage = ({ pages }, newPage) => {
  const newPages = [...pages, newPage]
  const content = JSON.stringify(newPage)
  return {
    id: SEARCH_INDEX_ID,
    parent,
    children: [],
    pages: newPages,
    internal: {
      type: SEARCH_INDEX_TYPE,
      content: content,
      contentDigest: content,
    },
  }
}

const createOrGetIndex = async (node, cache, getNode, server) => {
  const cacheKey = `${node.id}:index`
  const cached = await cache.get(cacheKey)
  if (cached) {
    return cached
  }

  const fields = ['markup', 'text']

  const resolvers = {
    MarkdownRemark: {
      title: n => {
        return n.frontmatter.title
      },
      markup: n => n.fields.markup,
      slug: n => n.fields.slug,
      text: n => n.fields.markup,
    },
  }
  const index = elasticlunr()
  index.setRef(`id`)
  fields.forEach(field => index.addField(field))
  for (const pageId of node.pages) {
    const pageNode = getNode(pageId)
    const fieldResolvers = resolvers[pageNode.internal.type]
    if (fieldResolvers) {
      const doc = {
        id: pageNode.id,
        date: pageNode.date,
        ...Object.keys(fieldResolvers).reduce(
          (prev, key) => ({
            ...prev,
            [key]: fieldResolvers[key](pageNode),
          }),
          {}
        ),
      }
      const dom = new JSDOM(pageNode.fields.markup)
      const elements = dom.window.document.querySelectorAll('body > *')
      for (let e = 0; e < elements.length; e++) {
        index.addDoc(Object.assign({}, doc, {id: `${pageNode.id}--${e}`, text: elements[e].innerHTML, markup: elements[e].outerHTML, elementIndex: e}))
      }
      index.addDoc(doc)
    }
  }

  const json = index.toJSON()
  await cache.set(cacheKey, json)
  return json
}



exports.createPages = ({ graphql, boundActionCreators }) => {
  const { createPage } = boundActionCreators

  return new Promise((resolve, reject) => {
    const blogPost = path.resolve('./src/templates/blog-post.js')
    resolve(
      graphql(
        `
          {
            allMarkdownRemark(
              sort: { fields: [frontmatter___date], order: DESC }
              limit: 1000
            ) {
              edges {
                node {
                  fields {
                    slug
                  }
                  frontmatter {
                    title
                  }
                }
              }
            }
          }
        `
      ).then(result => {
        if (result.errors) {
          console.log(result.errors)
          reject(result.errors)
        }

        // Create blog posts pages.
        const posts = result.data.allMarkdownRemark.edges

        _.each(posts, (post, index) => {
          const previous =
            index === posts.length - 1 ? null : posts[index + 1].node
          const next = index === 0 ? null : posts[index - 1].node

          createPage({
            path: post.node.fields.slug,
            component: blogPost,
            context: {
              slug: post.node.fields.slug,
              previous,
              next,
            },
          })
        })
        // After creating pages, create the index???
      })
    )
  })
}

exports.setFieldsOnGraphQLNodeType = (
  { type, getNode, cache },
  pluginOptions
) => {
  if (type.name !== SEARCH_INDEX_TYPE) return null
  return {
    index: {
      type: SearchIndex,
      resolve: (node, _opts, _3, server) =>
        createOrGetIndex(node, cache, getNode, server, pluginOptions),
    },
  }
}

exports.onCreateNode = ({ node, boundActionCreators, getNode }) => {
  const { createNode, createNodeField } = boundActionCreators

  if (node.internal.type === `MarkdownRemark`) {
    const value = createFilePath({ node, getNode })
    createNodeField({
      name: `slug`,
      node,
      value,
    })
  }
  let markup
  if (node.rawMarkdownBody) {
    unified()
      .use(markdown)
      .use(html)
      .process(node.rawMarkdownBody, (err, file) => {
        if (err) throw err
        markup = String(file)
        createNodeField({
          name: 'markup',
          node,
          value: markup,
        })
      })
  }

  const searchIndex = getNode(SEARCH_INDEX_ID) || createEmptySearchIndexNode()
  const newSearchIndex = appendPage(searchIndex, node.id)
  createNode(newSearchIndex)
}
