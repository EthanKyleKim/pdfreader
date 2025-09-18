import { pipeline, env, Pipeline } from '@xenova/transformers'

// 환경 설정: 로컬 모델 허용하지 않음 (HuggingFace Hub에서만)
env.allowLocalModels = false
env.allowRemoteModels = true

class EmbeddingService {
  private embedder: Pipeline | null = null
  private isInitializing = false
  private initPromise: Promise<void> | null = null

  async initialize(): Promise<void> {
    if (this.embedder) {
      return // 이미 초기화됨
    }

    if (this.isInitializing) {
      return this.initPromise // 초기화 진행 중
    }

    this.isInitializing = true
    this.initPromise = this._initialize()

    try {
      await this.initPromise
    } finally {
      this.isInitializing = false
    }
  }

  private async _initialize(): Promise<void> {
    console.log('임베딩 모델 로딩 중...')

    try {
      this.embedder = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        {
          quantized: true, // 양자화된 모델 사용 (더 빠름, 작은 메모리)
        }
      )
      console.log('임베딩 모델 로딩 완료')
    } catch (error) {
      console.error('임베딩 모델 로딩 실패:', error)
      throw new Error(`임베딩 모델 초기화 실패: ${error}`)
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embedder) {
      await this.initialize()
    }

    if (!this.embedder) {
      throw new Error('임베딩 모델이 초기화되지 않았습니다')
    }

    try {
      // 텍스트가 너무 길면 자르기 (모델 최대 토큰 길이: 512)
      const truncatedText = text.length > 2000 ? text.substring(0, 2000) : text

      const output = await this.embedder(truncatedText, {
        pooling: 'mean', // 평균 풀링
        normalize: true,  // 정규화 (코사인 유사도용)
      })

      // 출력을 숫자 배열로 변환
      const embedding = Array.from(output.data) as number[]

      // 384차원 확인 (all-MiniLM-L6-v2 모델)
      if (embedding.length !== 384) {
        console.warn(`예상치 못한 임베딩 차원: ${embedding.length}`)
      }

      return embedding
    } catch (error) {
      console.error('임베딩 생성 실패:', error)
      throw new Error(`임베딩 생성 중 오류: ${error}`)
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.embedder) {
      await this.initialize()
    }

    if (!this.embedder) {
      throw new Error('임베딩 모델이 초기화되지 않았습니다')
    }

    try {
      // 배치 처리로 여러 텍스트 동시 임베딩
      const embeddings = await Promise.all(
        texts.map(text => this.generateEmbedding(text))
      )

      return embeddings
    } catch (error) {
      console.error('배치 임베딩 생성 실패:', error)
      throw new Error(`배치 임베딩 생성 중 오류: ${error}`)
    }
  }

  // 모델이 로드되었는지 확인
  isReady(): boolean {
    return this.embedder !== null
  }

  // 메모리 정리 (필요한 경우)
  dispose(): void {
    if (this.embedder) {
      // Transformers.js는 자동으로 메모리 관리를 하지만
      // 명시적으로 참조를 제거할 수 있습니다
      this.embedder = null
    }
  }
}

// 싱글톤 인스턴스
let embeddingServiceInstance: EmbeddingService | null = null

export function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService()
  }
  return embeddingServiceInstance
}

// 편의 함수들
export async function generateEmbedding(text: string): Promise<number[]> {
  const service = getEmbeddingService()
  return service.generateEmbedding(text)
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const service = getEmbeddingService()
  return service.generateEmbeddings(texts)
}

// 임베딩 서비스 초기화 (앱 시작 시 호출)
export async function initializeEmbeddingService(): Promise<void> {
  const service = getEmbeddingService()
  await service.initialize()
}