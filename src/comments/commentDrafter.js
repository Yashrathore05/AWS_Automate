import { CONFIG } from '../config.js';

/**
 * Common AWS services and architectural topics for heuristic topic extraction
 */
const AWS_TOPICS = [
  'Lambda', 'Bedrock', 'DynamoDB', 'S3', 'ECS', 'EKS', 'Fargate',
  'Step Functions', 'EventBridge', 'SQS', 'SNS', 'API Gateway',
  'CloudWatch', 'CDK', 'CloudFormation', 'Terraform', 'OpenSearch',
  'SageMaker', 'AppSync', 'IAM', 'RDS', 'Aurora', 'Kinesis',
  'Glue', 'Athena', 'Redshift', 'Secrets Manager', 'Cognito'
];

export class CommentDrafter {
  constructor(apiKey = CONFIG.GEMINI_API_KEY) {
    this.apiKey = apiKey;
  }

  /**
   * Draft a natural, technically grounded comment for an article
   * @param {Object} articleData Extracted article data (title, sections, text, snippets)
   * @param {number} variationIndex Index to cycle through different thought angles
   * @returns {Promise<string>}
   */
  async draftComment(articleData, variationIndex = 0) {
    if (this.apiKey) {
      try {
        const aiComment = await this.generateWithGemini(articleData);
        if (aiComment) return aiComment;
      } catch (err) {
        console.warn(`[CommentDrafter] Gemini generation fallback: ${err.message}`);
      }
    }

    return this.generateGroundedHeuristicComment(articleData, variationIndex);
  }

  /**
   * Generates a grounded, technically accurate comment based strictly on the article content.
   * Strictly respects guidelines:
   * - Does not claim personal testing or fake experience.
   * - Highlights specific architectural choices or concepts from the text.
   * - Asks thoughtful follow-up questions relevant to the problem space.
   */
  generateGroundedHeuristicComment(articleData, variationIndex = 0) {
    const { title = '', content = '', headings = [] } = articleData;
    const fullText = `${title} ${content} ${headings.join(' ')}`;

    // Identify mentioned AWS services
    const detectedServices = AWS_TOPICS.filter(topic =>
      new RegExp(`\\b${topic}\\b`, 'i').test(fullText)
    );

    // Identify primary topic
    const primaryService = detectedServices[0] || 'AWS';
    const secondaryService = detectedServices[1] || null;

    // Extract an interesting heading or key section if available
    const meaningfulHeading = headings.find(h =>
      h.length > 8 && !/^(conclusion|summary|intro|introduction|resources|references)/i.test(h)
    );

    const templates = [
      // Variation 1: Focusing on architectural integration & tradeoffs
      () => {
        let comment = `Thanks for breaking down the approach on ${title.trim()}. `;
        if (secondaryService) {
          comment += `The way you structured the integration between ${primaryService} and ${secondaryService} provides a clean separation of concerns. `;
        } else if (meaningfulHeading) {
          comment += `The section highlighting "${meaningfulHeading}" was particularly insightful regarding the overall workflow. `;
        } else {
          comment += `The technical breakdown around ${primaryService} architecture is very practical. `;
        }
        comment += `In higher-throughput production workloads, what operational considerations or monitoring metrics do you prioritize watching most closely?`;
        return comment;
      },

      // Variation 2: Focusing on operational reliability and edge cases
      () => {
        let comment = `Appreciate the detailed walkthrough on ${title.trim()}! `;
        if (meaningfulHeading) {
          comment += `Particularly liked the points covered in "${meaningfulHeading}". `;
        } else {
          comment += `Clear and well-structured explanation of using ${primaryService} for this problem. `;
        }
        comment += `How do you typically approach idempotency and error handling when extending this pattern to handle unexpected downstream timeouts?`;
        return comment;
      },

      // Variation 3: Focusing on developer experience & maintenance
      () => {
        let comment = `Great write-up on ${title.trim()}. `;
        if (detectedServices.length > 1) {
          comment += `Balancing ${detectedServices.slice(0, 3).join(' and ')} keeps the infrastructure footprint modular and maintainable. `;
        } else {
          comment += `The step-by-step breakdown makes the ${primaryService} setup very approachable to follow. `;
        }
        comment += `Have you found any specific quotas or concurrency considerations that builders should keep an eye on when scaling this setup out?`;
        return comment;
      }
    ];

    const chosenTemplate = templates[variationIndex % templates.length];
    return chosenTemplate();
  }

  /**
   * Optional Gemini API generation adhering strictly to the user's constraints
   */
  async generateWithGemini(articleData) {
    const prompt = `You are an AWS cloud architect commenting on an AWS Builder Center article.
Guidelines you MUST strictly follow:
1. Write 2-3 concise, natural, polite sentences.
2. Directly reference the specific concepts, architectures, or AWS services described in this article.
3. NEVER claim you tested, benchmarked, or built this exact project yourself.
4. NEVER invent personal experience or past enterprise projects.
5. Offer genuine technical appreciation and ask an intelligent, relevant technical question about tradeoffs, observability, scaling, or edge cases.
6. Do NOT sound like an AI assistant. Be an active fellow builder in the AWS community.

Article Title: ${articleData.title}
Article Headings: ${JSON.stringify(articleData.headings || [])}
Article Excerpt:
${(articleData.content || '').slice(0, 2500)}

Your proposed comment:`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 200
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return candidate ? candidate.trim().replace(/^["']|["']$/g, '') : null;
  }
}

export const commentDrafter = new CommentDrafter();
