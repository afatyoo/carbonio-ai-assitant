import React from 'react';

import styled from '@emotion/styled';

type RobotMarkProps = {
	size?: number;
};

const Svg = styled.svg`
	display: block;
`;

export const RobotMark = ({ size = 28 }: RobotMarkProps): React.JSX.Element => (
	<Svg
		width={size}
		height={size}
		viewBox="0 0 32 32"
		fill="none"
		aria-hidden="true"
	>
		<path d="M16 4v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
		<circle cx="16" cy="3.5" r="1.5" fill="currentColor" />
		<rect x="6" y="8" width="20" height="17" rx="5" stroke="currentColor" strokeWidth="2.2" />
		<circle cx="12" cy="15" r="2" fill="currentColor" />
		<circle cx="20" cy="15" r="2" fill="currentColor" />
		<path d="M11 21h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
		<path d="M6 14H3v6h3M26 14h3v6h-3" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
	</Svg>
);

const NavButton = styled.button<{ active: boolean }>`
	width: 3rem;
	height: 3rem;
	display: grid;
	place-content: center;
	border: 0;
	border-radius: 0.5rem;
	cursor: pointer;
	color: ${({ active, theme }): string =>
		active ? theme.palette.primary.regular : theme.palette.text.regular};
	background: ${({ active, theme }): string =>
		active ? theme.palette.gray4.regular : theme.palette.gray6.regular};
`;

export const RobotPrimaryBarIcon = ({
	active,
	onClick
}: {
	active: boolean;
	onClick: () => void;
}): React.JSX.Element => (
	<NavButton active={active} onClick={onClick} aria-label="AI Assistant">
		<RobotMark />
	</NavButton>
);
