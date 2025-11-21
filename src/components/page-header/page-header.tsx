import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import './page-header.scss';

export interface PageHeaderProps {
    title: string;
    description: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
    return (
        <div className='page-header'>
            <OverlayTrigger placement='right' delay={{ show: 250, hide: 400 }} overlay={<Tooltip>{description}</Tooltip>}>
                <h1>{title}</h1>
            </OverlayTrigger>
        </div>
    );
}
