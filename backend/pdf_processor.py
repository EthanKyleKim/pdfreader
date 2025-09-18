"""
PDF 처리 모듈 - PyMuPDF 기반 고품질 텍스트 추출 및 청킹
"""
import fitz  # PyMuPDF
import pymupdf4llm
from typing import Dict, List, Optional, Tuple
import logging
from pathlib import Path
logger = logging.getLogger(__name__)


class TextChunker:
    """Python에서 텍스트 청킹을 담당하는 클래스"""

    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

        # 한국어에 최적화된 구분자
        self.separators = [
            '\n\n',      # 문단 분리
            '.\n',       # 문장 끝 + 줄바꿈
            '. ',        # 문장 끝
            '\n',        # 줄바꿈
            '! ',        # 감탄문
            '? ',        # 의문문
            '; ',        # 세미콜론
            ': ',        # 콜론
            ', ',        # 쉼표
            ' ',         # 공백
            '',          # 문자 단위
        ]

    def split_text(self, text: str) -> List[str]:
        """텍스트를 청크로 분할"""
        logger.info(f"청킹 시작: 텍스트 길이 {len(text)}자")

        if not text or len(text.strip()) == 0:
            logger.warning("빈 텍스트로 인한 청킹 실패")
            return []

        # 텍스트가 청크 크기보다 작으면 그대로 반환
        if len(text) <= self.chunk_size:
            logger.info(f"텍스트가 청크 크기보다 작음: {len(text)} <= {self.chunk_size}")
            return [text.strip()]

        chunks = self._recursive_split(text, self.separators)
        logger.info(f"청킹 완료: {len(chunks)}개 청크 생성")
        return chunks

    def _recursive_split(self, text: str, separators: List[str]) -> List[str]:
        """재귀적으로 텍스트 분할"""
        if not text.strip():
            return []

        # 현재 사용할 구분자 선택
        separator = separators[0] if separators else ''
        next_separators = separators[1:] if len(separators) > 1 else ['']

        # 구분자로 텍스트 분할
        if separator == '':
            # 문자 단위 분할 (최후의 수단)
            chunks = []
            current_chunk = ''
            for char in text:
                if len(current_chunk + char) <= self.chunk_size:
                    current_chunk += char
                else:
                    if current_chunk.strip():
                        chunks.append(current_chunk.strip())
                    current_chunk = char
            if current_chunk.strip():
                chunks.append(current_chunk.strip())
            return chunks

        splits = text.split(separator)
        if not splits:
            return [text.strip()] if text.strip() else []

        # 분할된 텍스트들을 처리
        current_doc = ''
        docs = []

        for i, split in enumerate(splits):
            # 구분자 복원 (마지막 요소가 아닌 경우에만)
            reconstructed = split + separator if i < len(splits) - 1 else split

            if len(current_doc + reconstructed) <= self.chunk_size:
                current_doc += reconstructed
            else:
                if current_doc.strip():
                    docs.append(current_doc.strip())
                    current_doc = ''

                # 현재 분할이 너무 크면 더 작은 구분자로 재귀 분할
                if len(reconstructed) > self.chunk_size and next_separators:
                    sub_chunks = self._recursive_split(reconstructed, next_separators)
                    docs.extend(sub_chunks)
                else:
                    current_doc = reconstructed

        # 마지막 문서 추가
        if current_doc.strip():
            docs.append(current_doc.strip())

        # 빈 docs 배열 방지
        if not docs:
            return [text.strip()] if text.strip() else []

        # 오버랩이 있는 청크 생성
        return self._create_overlapping_chunks(docs)

    def _create_overlapping_chunks(self, docs: List[str]) -> List[str]:
        """오버랩이 있는 청크 생성"""
        if len(docs) == 0:
            return []

        chunks = []

        for i, doc in enumerate(docs):
            chunk = doc

            # 이전 청크에서 오버랩 추가
            if i > 0 and self.chunk_overlap > 0:
                prev_chunk = docs[i - 1]
                overlap_text = self._get_overlap_text(prev_chunk, self.chunk_overlap)
                if overlap_text:
                    chunk = overlap_text + ' ' + chunk

            # 청크 크기 제한
            if len(chunk) > self.chunk_size:
                chunk = self._truncate_to_size(chunk, self.chunk_size)

            if chunk.strip():
                chunks.append(chunk.strip())

        return chunks

    def _get_overlap_text(self, text: str, max_length: int) -> str:
        """텍스트 끝에서 오버랩할 부분 추출"""
        if len(text) <= max_length:
            return text

        # 단어 경계를 고려하여 자르기
        words = text.split(' ')
        overlap = ''

        for i in range(len(words) - 1, -1, -1):
            candidate = ' '.join(words[i:])
            if len(candidate) <= max_length:
                overlap = candidate
                break

        return overlap or text[-max_length:]

    def _truncate_to_size(self, text: str, max_size: int) -> str:
        """텍스트를 지정된 크기로 자르기"""
        if len(text) <= max_size:
            return text

        # 단어 경계를 고려하여 자르기
        words = text.split(' ')
        result = ''

        for word in words:
            candidate = result + ' ' + word if result else word
            if len(candidate) <= max_size:
                result = candidate
            else:
                break

        # 단어로 자를 수 없으면 문자 단위로 자르기
        if not result and len(text) > 0:
            result = text[:max_size]

        return result


class PDFProcessor:
    """PDF 문서 처리를 위한 클래스"""

    def __init__(self, max_file_size_mb: int = 50):
        self.max_file_size_mb = max_file_size_mb
        self.max_file_size_bytes = max_file_size_mb * 1024 * 1024

    def validate_pdf(self, pdf_bytes: bytes, filename: str = "") -> None:
        """PDF 파일 유효성 검사"""
        # 파일 크기 검사
        if len(pdf_bytes) > self.max_file_size_bytes:
            size_mb = len(pdf_bytes) / (1024 * 1024)
            raise ValueError(
                f"파일이 너무 큽니다. 최대 {self.max_file_size_mb}MB 까지 지원합니다. "
                f"(현재: {size_mb:.1f}MB)"
            )

        # PDF 시그니처 확인
        if not pdf_bytes.startswith(b'%PDF'):
            raise ValueError("올바른 PDF 파일이 아닙니다.")

        # PyMuPDF로 문서 열기 테스트
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            if doc.page_count == 0:
                raise ValueError("빈 PDF 파일입니다.")
            doc.close()
        except Exception as e:
            raise ValueError(f"PDF 파일을 읽을 수 없습니다: {str(e)}")

    def extract_text_pymupdf4llm(self, pdf_bytes: bytes, filename: str = "") -> Dict:
        """pymupdf4llm을 사용한 고품질 텍스트 추출"""
        try:
            logger.info(f"PDF 텍스트 추출 시작: {filename}")

            # 임시 파일로 저장 후 처리
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
                tmp_file.write(pdf_bytes)
                tmp_file.flush()

                # pymupdf4llm로 마크다운 변환
                md_result = pymupdf4llm.to_markdown(
                    tmp_file.name,
                    page_chunks=True,  # 페이지별 청크 생성
                    write_images=False,  # 이미지 추출 비활성화
                    image_size_limit=0,  # 이미지 크기 제한
                    force_text=True,  # 텍스트 추출 강제
                )
                # page_chunks=True일 때 리스트를 반환하므로 결합
                if isinstance(md_result, list):
                    # 각 항목이 딕셔너리인 경우 텍스트 부분만 추출
                    if md_result and isinstance(md_result[0], dict):
                        md_text = '\n\n'.join([chunk.get('text', str(chunk)) for chunk in md_result])
                    else:
                        md_text = '\n\n'.join([str(chunk) for chunk in md_result])
                else:
                    md_text = str(md_result)

            # 임시 파일 삭제
            import os
            os.unlink(tmp_file.name)

            # 기본 메타데이터 추출
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            metadata = {
                'page_count': doc.page_count,
                'title': doc.metadata.get('title', ''),
                'author': doc.metadata.get('author', ''),
                'subject': doc.metadata.get('subject', ''),
                'creator': doc.metadata.get('creator', ''),
                'producer': doc.metadata.get('producer', ''),
                'creation_date': doc.metadata.get('creationDate', ''),
                'modification_date': doc.metadata.get('modDate', ''),
            }
            doc.close()

            logger.info(f"텍스트 추출 완료: {len(md_text)}자, {metadata['page_count']}페이지")

            return {
                'text': md_text,
                'metadata': metadata,
                'extraction_method': 'pymupdf4llm',
                'filename': filename,
            }

        except Exception as e:
            logger.error(f"pymupdf4llm 추출 실패: {str(e)}")
            # 폴백: 기본 PyMuPDF 추출
            return self.extract_text_basic(pdf_bytes, filename)

    def extract_text_basic(self, pdf_bytes: bytes, filename: str = "") -> Dict:
        """기본 PyMuPDF를 사용한 텍스트 추출 (폴백)"""
        try:
            logger.info(f"기본 PDF 텍스트 추출: {filename}")

            doc = fitz.open(stream=pdf_bytes, filetype="pdf")

            # 텍스트 추출
            text_blocks = []
            for page_num in range(doc.page_count):
                page = doc.load_page(page_num)

                # 페이지 텍스트 추출
                page_text = page.get_text()
                if page_text.strip():
                    text_blocks.append(f"# 페이지 {page_num + 1}\n\n{page_text}")

            # 메타데이터 추출
            metadata = {
                'page_count': doc.page_count,
                'title': doc.metadata.get('title', ''),
                'author': doc.metadata.get('author', ''),
                'subject': doc.metadata.get('subject', ''),
                'creator': doc.metadata.get('creator', ''),
                'producer': doc.metadata.get('producer', ''),
                'creation_date': doc.metadata.get('creationDate', ''),
                'modification_date': doc.metadata.get('modDate', ''),
            }

            doc.close()

            combined_text = '\n\n'.join(text_blocks)

            logger.info(f"기본 텍스트 추출 완료: {len(combined_text)}자")

            return {
                'text': combined_text,
                'metadata': metadata,
                'extraction_method': 'pymupdf_basic',
                'filename': filename,
            }

        except Exception as e:
            logger.error(f"기본 텍스트 추출 실패: {str(e)}")
            raise ValueError(f"PDF 텍스트 추출 실패: {str(e)}")

    def extract_text_with_structure(self, pdf_bytes: bytes, filename: str = "") -> Dict:
        """구조 정보를 포함한 고급 텍스트 추출"""
        try:
            logger.info(f"구조적 PDF 텍스트 추출: {filename}")

            doc = fitz.open(stream=pdf_bytes, filetype="pdf")

            structured_content = []

            for page_num in range(doc.page_count):
                page = doc.load_page(page_num)

                # 텍스트 블록 추출 (위치 정보 포함)
                blocks = page.get_text("dict")

                page_content = {
                    'page_number': page_num + 1,
                    'text_blocks': [],
                    'tables': [],
                    'images': []
                }

                for block in blocks.get('blocks', []):
                    if 'lines' in block:  # 텍스트 블록
                        block_text = []
                        for line in block['lines']:
                            line_text = []
                            for span in line['spans']:
                                text = span['text'].strip()
                                if text:
                                    line_text.append(text)
                            if line_text:
                                block_text.append(' '.join(line_text))

                        if block_text:
                            page_content['text_blocks'].append({
                                'text': '\n'.join(block_text),
                                'bbox': block['bbox'],
                                'type': 'text'
                            })

                # 테이블 탐지 (간단한 휴리스틱)
                tables = page.find_tables()
                for table in tables:
                    try:
                        table_data = table.extract()
                        if table_data:
                            page_content['tables'].append({
                                'data': table_data,
                                'bbox': table.bbox,
                                'type': 'table'
                            })
                    except Exception as e:
                        logger.warning(f"테이블 추출 실패 (페이지 {page_num + 1}): {str(e)}")

                structured_content.append(page_content)

            # 메타데이터
            metadata = {
                'page_count': doc.page_count,
                'title': doc.metadata.get('title', ''),
                'author': doc.metadata.get('author', ''),
                'subject': doc.metadata.get('subject', ''),
                'has_tables': any(page['tables'] for page in structured_content),
                'total_text_blocks': sum(len(page['text_blocks']) for page in structured_content),
                'total_tables': sum(len(page['tables']) for page in structured_content),
            }

            doc.close()

            # 텍스트로 변환
            markdown_text = self.convert_structured_to_markdown(structured_content)

            logger.info(f"구조적 텍스트 추출 완료: {len(markdown_text)}자")

            return {
                'text': markdown_text,
                'structured_content': structured_content,
                'metadata': metadata,
                'extraction_method': 'pymupdf_structured',
                'filename': filename,
            }

        except Exception as e:
            logger.error(f"구조적 텍스트 추출 실패: {str(e)}")
            # 폴백: 기본 텍스트 추출
            return self.extract_text_basic(pdf_bytes, filename)

    def convert_structured_to_markdown(self, structured_content: List[Dict]) -> str:
        """구조화된 콘텐츠를 마크다운으로 변환"""
        markdown_parts = []

        for page in structured_content:
            page_num = page['page_number']
            markdown_parts.append(f"# 페이지 {page_num}\n")

            # 텍스트 블록
            for block in page['text_blocks']:
                text = block['text'].strip()
                if text:
                    markdown_parts.append(text)
                    markdown_parts.append("")  # 빈 줄

            # 테이블
            for table in page['tables']:
                markdown_parts.append("## 테이블\n")
                try:
                    # 테이블을 마크다운 형식으로 변환
                    table_data = table['data']
                    if table_data and len(table_data) > 0:
                        # 헤더
                        if len(table_data[0]) > 0:
                            header = " | ".join(str(cell) for cell in table_data[0])
                            separator = " | ".join("---" for _ in table_data[0])
                            markdown_parts.append(f"| {header} |")
                            markdown_parts.append(f"| {separator} |")

                        # 데이터 행
                        for row in table_data[1:]:
                            if row:  # 빈 행 건너뛰기
                                row_text = " | ".join(str(cell) if cell else "" for cell in row)
                                markdown_parts.append(f"| {row_text} |")

                        markdown_parts.append("")  # 빈 줄
                except Exception as e:
                    logger.warning(f"테이블 마크다운 변환 실패: {str(e)}")
                    markdown_parts.append("[테이블 변환 실패]\n")

            markdown_parts.append("\n---\n")  # 페이지 구분자

        return "\n".join(markdown_parts)

    def process_pdf(self, pdf_bytes: bytes, filename: str = "", method: str = "auto") -> Dict:
        """PDF 처리 및 텍스트 청킹 메인 함수"""
        # 유효성 검사
        self.validate_pdf(pdf_bytes, filename)

        # 텍스트 추출
        extraction_result = self._extract_text(pdf_bytes, filename, method)

        # 텍스트 청킹
        chunker = TextChunker(chunk_size=1000, chunk_overlap=200)
        chunks = chunker.split_text(extraction_result['text'])

        logger.info(f"텍스트 청킹 완료: {len(chunks)}개 청크 생성")

        # 청킹 결과 포함한 최종 응답
        return {
            'ok': True,
            'chunks': chunks,
            'metadata': extraction_result['metadata'],
            'extraction_method': extraction_result['extraction_method'],
            'filename': extraction_result['filename'],
            'chunk_count': len(chunks),
        }

    def _extract_text(self, pdf_bytes: bytes, filename: str = "", method: str = "auto") -> Dict:
        """내부 텍스트 추출 함수"""
        # 추출 방법 선택
        if method == "auto":
            # 자동 선택: pymupdf4llm 우선, 실패시 폴백
            try:
                return self.extract_text_pymupdf4llm(pdf_bytes, filename)
            except Exception as e:
                logger.warning(f"pymupdf4llm 실패, 구조적 추출로 폴백: {str(e)}")
                return self.extract_text_with_structure(pdf_bytes, filename)
        elif method == "pymupdf4llm":
            return self.extract_text_pymupdf4llm(pdf_bytes, filename)
        elif method == "structured":
            return self.extract_text_with_structure(pdf_bytes, filename)
        elif method == "basic":
            return self.extract_text_basic(pdf_bytes, filename)
        else:
            raise ValueError(f"지원하지 않는 추출 방법: {method}")


def process_pdf_file(pdf_bytes: bytes, filename: str = "", method: str = "auto") -> Dict:
    """PDF 파일 처리 편의 함수"""
    processor = PDFProcessor()
    return processor.process_pdf(pdf_bytes, filename, method)