import React, { Component } from 'react'
import Link from 'gatsby-link'
import get from 'lodash/get'
import Helmet from 'react-helmet'

import Bio from '../components/Bio'
import { rhythm } from '../utils/typography'

import { Index } from 'elasticlunr'

class BlogIndex extends React.Component {
  state = {
    query: '',
  }
  getOrCreateIndex = () =>
    this.index
      ? this.index
      : Index.load(this.props.data.siteSearchIndex.index)
  search = evt => {
    const query = evt.target.value
    this.index = this.getOrCreateIndex()
    const results = this.index
      .search(query)
      .map(({ ref }) => this.index.documentStore.getDoc(ref))
    console.info(results)
    this.setState({
      query,
      results,
    })
  }
  render() {
    const { search } = this
    const { query, results } = this.state
    const siteTitle = get(this, 'props.data.site.siteMetadata.title')
    const posts = get(this, 'props.data.allMarkdownRemark.edges')
    const renderResults = results => (
      <ul>
        {results.map((r, idx) => (
          <li key={`search-entry--${idx}`}>
            <Link
              to={`${r.slug}${
                r.elementIndex !== undefined
                  ? `?elementIndex=${r.elementIndex}`
                  : ''
              }`}
            >
              {r.title}
            </Link>
          </li>
        ))}
      </ul>
    )
    return (
      <div>
        <Helmet title={siteTitle} />
        <Bio />
        <input
          type="text"
          placeholder="Search"
          value={query}
          onChange={search}
        />

        {results && renderResults(results)}
        {posts.map(({ node }) => {
          const title = get(node, 'frontmatter.title') || node.fields.slug
          return (
            <div key={node.fields.slug}>
              <h3
                style={{
                  marginBottom: rhythm(1 / 4),
                }}
              >
                <Link style={{ boxShadow: 'none' }} to={node.fields.slug}>
                  {title}
                </Link>
              </h3>
              <small>{node.frontmatter.date}</small>
              <p dangerouslySetInnerHTML={{ __html: node.excerpt }} />
            </div>
          )
        })}
      </div>
    )
  }
}

export default BlogIndex

export const pageQuery = graphql`
  query IndexAndSearchQuery {
    siteSearchIndex {
      index
    }
    site {
      siteMetadata {
        title
      }
    }
    allMarkdownRemark(sort: { fields: [frontmatter___date], order: DESC }) {
      edges {
        node {
          excerpt
          fields {
            slug
          }
          frontmatter {
            date(formatString: "DD MMMM, YYYY")
            title
          }
        }
      }
    }
  }
`